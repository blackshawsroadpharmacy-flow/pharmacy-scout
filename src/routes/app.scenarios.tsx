/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Copy, Download, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getMyProfile, listMyOrgs } from "@/lib/orgs.functions";
import {
  changeScenario,
  createGreenfieldScenario,
  createRelocationScenario,
  listScenarios,
  recalculateScenario,
  searchScenarioOrigins,
} from "@/lib/scenarios.functions";

export const Route = createFileRoute("/app/scenarios")({
  head: () => ({
    meta: [{ title: "Saved scenarios — Chemist Care" }, { name: "robots", content: "noindex" }],
  }),
  component: ScenariosPage,
});

function ScenariosPage() {
  const listFn = useServerFn(listScenarios),
    profileFn = useServerFn(getMyProfile),
    orgsFn = useServerFn(listMyOrgs);
  const createGreenfield = useServerFn(createGreenfieldScenario),
    createRelocation = useServerFn(createRelocationScenario);
  const changeFn = useServerFn(changeScenario),
    recalcFn = useServerFn(recalculateScenario);
  const q = useQuery({ queryKey: ["saved-scenarios"], queryFn: () => listFn() });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const orgName =
    (orgs.data ?? []).find((x) => x.id === profile.data?.current_organisation_id)?.name ?? null;
  const [showArchived, setShowArchived] = useState(false),
    [compare, setCompare] = useState<string[]>([]);
  const [form, setForm] = useState({
    type: "greenfield",
    name: "",
    address: "",
    address_source: "",
    lat: "",
    lng: "",
    quality: "searched_address",
    confidence: "",
    radius: "1500",
    notes: "",
    origin_id: "",
    origin_query: "",
  });
  const originFn = useServerFn(searchScenarioOrigins);
  const origins = useQuery({
    queryKey: ["scenario-origins", form.origin_query],
    enabled: form.type === "relocation" && form.origin_query.length >= 2,
    queryFn: () => originFn({ data: { query: form.origin_query } }),
  });
  const all = [
    ...(q.data?.greenfield ?? []).map((x: any) => ({ ...x, type: "greenfield" })),
    ...(q.data?.relocation ?? []).map((x: any) => ({ ...x, type: "relocation" })),
  ];
  const visible = all.filter((x) => showArchived || !x.archived_at);

  async function save() {
    try {
      const payload = {
        name: form.name,
        address: form.address || null,
        address_source: form.address_source || null,
        point: { lat: Number(form.lat), lng: Number(form.lng) },
        coordinate_quality: form.quality,
        coordinate_confidence: form.confidence === "" ? null : Number(form.confidence),
        radius_m: Number(form.radius),
        notes: form.notes || null,
      };
      if (form.type === "greenfield") await createGreenfield({ data: payload });
      else await createRelocation({ data: { ...payload, origin_pharmacy_id: form.origin_id } });
      toast.success("Scenario saved with immutable assessment version 1");
      setForm({ ...form, name: "", notes: "" });
      await q.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scenario could not be saved");
    }
  }
  async function action(item: any, action: "archive" | "reopen" | "duplicate") {
    try {
      await changeFn({ data: { type: item.type, id: item.id, action } });
      await q.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }
  async function recalc(item: any) {
    const inputs = item.inputs ?? {};
    const point =
      item.type === "greenfield"
        ? { lat: item.proposed_lat, lng: item.proposed_lng }
        : { lat: item.destination_lat, lng: item.destination_lng };
    try {
      await recalcFn({
        data: { type: item.type, id: item.id, point, radius_m: inputs.analysis_radius_m ?? 1500 },
      });
      toast.success("New assessment version created; prior evidence retained");
      await q.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recalculation failed");
    }
  }
  return (
    <AppShell currentOrgName={orgName}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Saved planning scenarios</h1>
            <p className="text-sm text-muted-foreground">
              Greenfield and relocation are separate private workflows. Recalculation never
              overwrites evidence.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button className="btn" onClick={() => exportCsv(visible)}>
              <Download className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>

        <section className="mt-5 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">New scenario</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Workflow">
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="greenfield">Greenfield candidate</option>
                <option value="relocation">Relocation</option>
              </select>
            </Field>
            <Field label="Scenario name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Analysis radius (m)">
              <input
                className="input"
                type="number"
                min="100"
                max="20000"
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
              />
            </Field>
            {form.type === "relocation" && (
              <Field label="Existing origin pharmacy">
                <input
                  className="input"
                  placeholder="Search name or address"
                  value={form.origin_query}
                  onChange={(e) =>
                    setForm({ ...form, origin_query: e.target.value, origin_id: "" })
                  }
                />
                <select
                  className="input mt-1"
                  value={form.origin_id}
                  onChange={(e) => setForm({ ...form, origin_id: e.target.value })}
                >
                  <option value="">Select required origin</option>
                  {(origins.data ?? []).map((x: any) => (
                    <option key={x.id} value={x.id}>
                      {x.name} — {x.address}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label={
                form.type === "relocation"
                  ? "Proposed destination address"
                  : "Searched candidate address"
              }
            >
              <input
                className="input"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <Field label="Address source URL">
              <input
                className="input"
                value={form.address_source}
                onChange={(e) => setForm({ ...form, address_source: e.target.value })}
              />
            </Field>
            <Field label="Latitude">
              <input
                className="input"
                inputMode="decimal"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
            </Field>
            <Field label="Longitude">
              <input
                className="input"
                inputMode="decimal"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </Field>
            <Field label="Coordinate quality">
              <select
                className="input"
                value={form.quality}
                onChange={(e) => setForm({ ...form, quality: e.target.value })}
              >
                <option value="verified_point">Verified point</option>
                <option value="searched_address">Searched address</option>
                <option value="map_click">Map click</option>
                <option value="approximate">Approximate</option>
              </select>
            </Field>
            <Field label="Coordinate confidence (0–1)">
              <input
                className="input"
                type="number"
                min="0"
                max="1"
                step=".01"
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: e.target.value })}
              />
            </Field>
            <Field label="Private notes">
              <textarea
                className="input min-h-20"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          <button className="btn-primary mt-3" onClick={save}>
            Save and assess
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Preliminary commercial screening only. Professional public-door measurement and legal
            review are required; no final Pharmacy Location Rule conclusion is made.
          </p>
        </section>

        <div className="mt-5 flex items-center justify-between">
          <h2 className="font-semibold">Organisation scenarios</h2>
          <label className="text-xs">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />{" "}
            Show archived
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <ScenarioCard
              key={`${item.type}:${item.id}`}
              item={item}
              checked={compare.includes(`${item.type}:${item.id}`)}
              toggle={() =>
                setCompare((c) =>
                  c.includes(`${item.type}:${item.id}`)
                    ? c.filter((x) => x !== `${item.type}:${item.id}`)
                    : c.length < 4
                      ? [...c, `${item.type}:${item.id}`]
                      : c,
                )
              }
              action={(a) => action(item, a)}
              recalc={() => recalc(item)}
            />
          ))}
        </div>
        {compare.length >= 2 && (
          <Comparison items={all.filter((x) => compare.includes(`${x.type}:${x.id}`))} />
        )}
      </div>
      <style>{`.input{width:100%;border:1px solid var(--input);border-radius:6px;background:var(--background);padding:8px}.btn,.btn-primary{display:inline-flex;gap:6px;align-items:center;border-radius:6px;padding:8px 12px;font-size:13px}.btn{border:1px solid var(--input)}.btn-primary{background:var(--primary);color:var(--primary-foreground)}`}</style>
    </AppShell>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
function ScenarioCard({
  item,
  checked,
  toggle,
  action,
  recalc,
}: {
  item: any;
  checked: boolean;
  toggle: () => void;
  action: (a: any) => void;
  recalc: () => void;
}) {
  const assessments =
    (item.type === "greenfield" ? item.greenfield_assessments : item.relocation_assessments) ?? [];
  const latest = [...assessments].sort(
    (a: any, b: any) => b.sequence_number - a.sequence_number,
  )[0];
  const snapshot = latest?.evidence_snapshot ?? latest?.destination_evidence_snapshot;
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex justify-between gap-2">
        <div>
          <span className="rounded bg-muted px-2 py-1 text-[10px] uppercase">{item.type}</span>
          <h3 className="mt-2 font-semibold">{item.name}</h3>
        </div>
        <label className="text-xs">
          <input type="checkbox" checked={checked} onChange={toggle} /> Compare
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {item.proposed_address ?? item.destination_address ?? "Address not supplied"}
      </p>
      <dl className="mt-3 space-y-1 text-xs">
        <div>
          Assessment versions: <b>{assessments.length}</b>
        </div>
        <div>
          Latest retrieval:{" "}
          <b>
            {latest?.assessed_at ? new Date(latest.assessed_at).toLocaleString() : "Not assessed"}
          </b>
        </div>
        <div>
          Radius: <b>{item.inputs?.analysis_radius_m ?? "Unknown"} m</b>
        </div>
        <div>
          Evidence status: <b>{snapshot?.assessment_label ?? "Unknown"}</b>
        </div>
      </dl>
      {latest && assessments.length > 1 && (
        <div className="mt-2 rounded bg-muted p-2 text-xs">
          <b>What changed since version {latest.sequence_number - 1}</b>
          <pre className="mt-1 whitespace-pre-wrap font-sans">
            {JSON.stringify(latest.change_summary, null, 2)}
          </pre>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={recalc}>
          <RefreshCw className="h-3 w-3" />
          Recalculate
        </button>
        <button className="btn" onClick={() => action("duplicate")}>
          <Copy className="h-3 w-3" />
          Duplicate
        </button>
        {item.archived_at ? (
          <button className="btn" onClick={() => action("reopen")}>
            <RotateCcw className="h-3 w-3" />
            Reopen
          </button>
        ) : (
          <button className="btn" onClick={() => action("archive")}>
            <Archive className="h-3 w-3" />
            Archive
          </button>
        )}
      </div>
    </article>
  );
}
function Comparison({ items }: { items: any[] }) {
  return (
    <section className="mt-5 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Scenario comparison ({items.length})</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const a =
            (item.type === "greenfield"
              ? item.greenfield_assessments
              : item.relocation_assessments) ?? [];
          const latest = [...a].sort((x: any, y: any) => y.sequence_number - x.sequence_number)[0];
          const s = latest?.evidence_snapshot ?? latest?.destination_evidence_snapshot;
          return (
            <div key={item.id} className="rounded border p-3 text-xs">
              <b>{item.name}</b>
              <div>Type: {item.type}</div>
              <div>Pharmacies: {s?.pharmacies_within_radius?.length ?? "Unknown"}</div>
              <div>Medical centres: {s?.medical_centres_within_500m?.length ?? "Unknown"}</div>
              <div>Supermarkets: {s?.supermarkets_within_500m?.length ?? "Unknown"}</div>
              <div>Confidence: {s?.assessment_label ?? "Unknown"}</div>
              <div>Warnings: {s?.required_caveats?.length ?? "Unknown"}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Unknown values remain unknown and are never converted to zero.
      </p>
    </section>
  );
}
function exportCsv(items: any[]) {
  const esc = (x: any) => `"${String(x ?? "").replaceAll('"', '""')}"`;
  const lines = [
    ["type", "name", "address", "archived", "assessment_versions"],
    ...items.map((x) => [
      x.type,
      x.name,
      x.proposed_address ?? x.destination_address,
      x.archived_at ? "yes" : "no",
      (x.greenfield_assessments ?? x.relocation_assessments ?? []).length,
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob([lines.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "private-planning-scenarios.csv";
  a.click();
  URL.revokeObjectURL(url);
}
