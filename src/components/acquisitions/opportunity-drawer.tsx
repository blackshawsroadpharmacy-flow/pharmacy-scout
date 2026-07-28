/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, Map, Paperclip, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganisationId } from "@/lib/pharmacy-profiles.public";
import {
  addOpportunityItem,
  deleteOpportunityDocument,
  getOpportunityWorkspace,
  registerOpportunityDocument,
  toggleOpportunityItem,
  updateOpportunityWorkspace,
} from "@/lib/opportunity-workspace.functions";
import { PIPELINE_STAGES } from "@/lib/businesses.functions";

const STAGE_LABEL: Record<string, string> = {
  watchlist: "Watchlist",
  contacting: "Contacting",
  im_received: "IM received",
  due_diligence: "Due diligence",
  offer: "Offer",
  passed: "Passed",
  acquired: "Acquired",
};
const METRICS = [
  ["asking_price", "Asking price", "AUD"],
  ["annual_rent", "Annual rent", "AUD_per_year"],
  ["revenue", "Revenue", "AUD_per_year"],
  ["scripts_per_day", "Scripts per day", "scripts_per_day"],
  ["gross_profit", "Gross profit", "AUD_per_year"],
  ["wages", "Wages", "AUD_per_year"],
  ["earnings", "Earnings", "AUD_per_year"],
  ["stock_value", "Stock value", "AUD"],
] as const;

export function OpportunityDrawer({
  opportunityId,
  onClose,
  onChanged,
}: {
  opportunityId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const getFn = useServerFn(getOpportunityWorkspace);
  const updateFn = useServerFn(updateOpportunityWorkspace);
  const addFn = useServerFn(addOpportunityItem);
  const toggleFn = useServerFn(toggleOpportunityItem);
  const registerFn = useServerFn(registerOpportunityDocument);
  const deleteFn = useServerFn(deleteOpportunityDocument);
  const q = useQuery({
    queryKey: ["opportunity-workspace", opportunityId],
    queryFn: () => getFn({ data: { opportunity_id: opportunityId } }),
  });
  const data = q.data as any;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState("");
  const [task, setTask] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [note, setNote] = useState("");
  const [metric, setMetric] = useState<(typeof METRICS)[number][0]>("asking_price");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [confidence, setConfidence] = useState("unverified");

  const value = (key: string, fallback: unknown) =>
    draft[key] ?? (fallback == null ? "" : String(fallback));
  const set = (key: string, next: string) => setDraft((old) => ({ ...old, [key]: next }));
  const refresh = async () => {
    await q.refetch();
    onChanged();
  };

  if (q.isLoading)
    return (
      <DrawerFrame onClose={onClose}>
        <p>Loading private workspace…</p>
      </DrawerFrame>
    );
  if (q.error || !data?.opportunity) {
    return (
      <DrawerFrame onClose={onClose}>
        <p className="text-destructive">Unable to open this opportunity.</p>
      </DrawerFrame>
    );
  }
  const o = data.opportunity;
  const b = data.business ?? {};
  const canonicalHref = b.premises_id ? `/pharmacy/${encodeURIComponent(b.premises_id)}` : null;

  async function save() {
    try {
      const url = value("listing_url", b.listing_url).trim();
      await updateFn({
        data: {
          opportunity_id: opportunityId,
          title: value("title", o.title).trim(),
          summary: value("summary", o.summary).trim() || null,
          pipeline_stage: value("pipeline_stage", o.pipeline_stage) as any,
          vendor_name: value("vendor_name", b.vendor_name).trim() || null,
          vendor_contact: value("vendor_contact", b.vendor_contact).trim() || null,
          broker_name: value("broker_name", b.broker_name ?? b.broker_or_source).trim() || null,
          broker_contact: value("broker_contact", b.broker_contact).trim() || null,
          listing_url: url || null,
          listing_status: value("listing_status", b.listing_status || "unknown") as any,
          lease_expiry: value("lease_expiry", b.lease_expiry) || null,
          lease_option_periods:
            value("lease_option_periods", b.lease_option_periods).trim() || null,
        },
      });
      toast.success("Opportunity saved");
      setDraft({});
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function add(kind: "checklist" | "task" | "note") {
    const title = kind === "checklist" ? checklist : kind === "task" ? task : note;
    if (!title.trim()) return;
    try {
      await addFn({
        data: {
          opportunity_id: opportunityId,
          kind,
          title: title.trim(),
          owner_name: kind === "task" ? taskOwner.trim() || null : undefined,
          due_date: kind === "task" ? taskDue || null : undefined,
        } as any,
      });
      setChecklist("");
      setTask("");
      setTaskOwner("");
      setTaskDue("");
      setNote("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Add failed");
    }
  }

  async function addFigure() {
    const selected = METRICS.find(([key]) => key === metric)!;
    if (!amount || !source.trim()) return toast.error("Value and evidence source are required.");
    try {
      await addFn({
        data: {
          opportunity_id: opportunityId,
          kind: "figure",
          metric,
          amount: Number(amount),
          unit: selected[2],
          source: source.trim(),
          evidence_period_start: periodStart || null,
          evidence_period_end: periodEnd || null,
          confidence: confidence as any,
        },
      });
      setAmount("");
      setSource("");
      setPeriodStart("");
      setPeriodEnd("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Figure could not be saved");
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    try {
      const org = await getCurrentOrganisationId();
      for (const file of Array.from(files)) {
        if (
          ![
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ].includes(file.type) ||
          file.size < 1 ||
          file.size > 26214400
        )
          throw new Error("IM files must be PDF, DOCX or XLSX and no larger than 25 MB.");
        const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${org}/opportunities/${opportunityId}/${crypto.randomUUID()}-${name}`;
        const result = await supabase.storage.from("information-memorandums").upload(path, file);
        if (result.error) throw result.error;
        try {
          await registerFn({
            data: {
              opportunity_id: opportunityId,
              storage_path: path,
              file_name: file.name,
              mime_type: file.type || null,
              size_bytes: file.size,
            },
          });
        } catch (error) {
          await supabase.storage.from("information-memorandums").remove([path]);
          throw error;
        }
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  async function openDocument(doc: any) {
    const result = await supabase.storage
      .from("information-memorandums")
      .createSignedUrl(doc.storage_path, 300, { download: doc.file_name });
    if (result.error) return toast.error(result.error.message);
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(doc: any) {
    const storage = await supabase.storage
      .from("information-memorandums")
      .remove([doc.storage_path]);
    if (storage.error) return toast.error(storage.error.message);
    await deleteFn({ data: { opportunity_id: opportunityId, document_id: doc.id } });
    await refresh();
  }

  return (
    <DrawerFrame onClose={onClose}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{o.title}</h2>
          <p className="text-xs text-muted-foreground">Private to your organisation</p>
        </div>
        <div className="flex gap-2">
          {canonicalHref && (
            <a href={canonicalHref} className="button-secondary">
              <Map className="h-4 w-4" />
              Canonical pharmacy
            </a>
          )}
          {b.listing_url && (
            <a href={b.listing_url} target="_blank" rel="noreferrer" className="button-secondary">
              <ExternalLink className="h-4 w-4" />
              Listing
            </a>
          )}
        </div>
      </div>

      <Section title="Opportunity details">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Title" value={value("title", o.title)} onChange={(v) => set("title", v)} />
          <Select
            label="Stage"
            value={value("pipeline_stage", o.pipeline_stage)}
            onChange={(v) => set("pipeline_stage", v)}
            options={PIPELINE_STAGES.map((key) => [key, STAGE_LABEL[key]])}
          />
          <Input
            label="Broker"
            value={value("broker_name", b.broker_name ?? b.broker_or_source)}
            onChange={(v) => set("broker_name", v)}
          />
          <Input
            label="Broker contact"
            value={value("broker_contact", b.broker_contact)}
            onChange={(v) => set("broker_contact", v)}
          />
          <Input
            label="Vendor / owner"
            value={value("vendor_name", b.vendor_name)}
            onChange={(v) => set("vendor_name", v)}
          />
          <Input
            label="Vendor contact"
            value={value("vendor_contact", b.vendor_contact)}
            onChange={(v) => set("vendor_contact", v)}
          />
          <Input
            label="Listing URL"
            value={value("listing_url", b.listing_url)}
            onChange={(v) => set("listing_url", v)}
          />
          <Select
            label="Listing status"
            value={value("listing_status", b.listing_status || "unknown")}
            onChange={(v) => set("listing_status", v)}
            options={[
              "unknown",
              "off_market",
              "coming_soon",
              "listed",
              "under_offer",
              "sold",
              "withdrawn",
            ].map((x) => [x, x.replaceAll("_", " ")])}
          />
          <Input
            label="Lease expiry"
            type="date"
            value={value("lease_expiry", b.lease_expiry)}
            onChange={(v) => set("lease_expiry", v)}
          />
          <Input
            label="Option periods"
            value={value("lease_option_periods", b.lease_option_periods)}
            onChange={(v) => set("lease_option_periods", v)}
          />
        </div>
        <label className="mt-3 block text-xs">
          Private summary
          <textarea
            className="input mt-1 min-h-24 w-full"
            value={value("summary", o.summary)}
            onChange={(e) => set("summary", e.target.value)}
          />
        </label>
        <button onClick={save} className="button-primary mt-3">
          Save details
        </button>
      </Section>

      <Section title="Commercial figures and provenance">
        <p className="mb-3 text-xs text-muted-foreground">
          Every supplied figure requires a source. Missing values remain unknown and are never
          treated as zero.
        </p>
        <div className="grid gap-2 md:grid-cols-4">
          <Select
            label="Metric"
            value={metric}
            onChange={(v) => setMetric(v as any)}
            options={METRICS.map(([k, l]) => [k, l])}
          />
          <Input label="Value" type="number" value={amount} onChange={setAmount} />
          <Input label="Period from" type="date" value={periodStart} onChange={setPeriodStart} />
          <Input label="Period to" type="date" value={periodEnd} onChange={setPeriodEnd} />
          <div className="md:col-span-2">
            <Input label="Evidence source" value={source} onChange={setSource} />
          </div>
          <Select
            label="Confidence"
            value={confidence}
            onChange={setConfidence}
            options={["unverified", "low", "medium", "high"].map((x) => [x, x])}
          />
          <button onClick={addFigure} className="button-primary self-end">
            Add figure
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {data.figures.map((f: any) => (
            <div key={f.id} className="rounded border p-2 text-xs">
              <b>
                {METRICS.find(([k]) => k === f.metric)?.[1] ?? f.metric}:{" "}
                {Number(f.amount).toLocaleString()} {f.unit}
              </b>
              <div className="text-muted-foreground">
                Source: {f.source} · Period: {f.evidence_period_start ?? "unspecified"}–
                {f.evidence_period_end ?? "unspecified"} · Confidence: {f.confidence} · Entered by:{" "}
                {f.entered_by ?? "unknown"} · {new Date(f.entered_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Due-diligence checklist">
          <QuickAdd
            value={checklist}
            setValue={setChecklist}
            action={() => add("checklist")}
            placeholder="Add checklist item"
          />
          {data.checklist.map((x: any) => (
            <CheckRow
              key={x.id}
              item={x}
              onToggle={async (completed) => {
                await toggleFn({
                  data: { opportunity_id: opportunityId, kind: "checklist", id: x.id, completed },
                });
                await refresh();
              }}
            />
          ))}
        </Section>
        <Section title="Tasks and important dates">
          <div className="grid grid-cols-3 gap-2">
            <input
              className="input col-span-3"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Task"
            />
            <input
              className="input"
              value={taskOwner}
              onChange={(e) => setTaskOwner(e.target.value)}
              placeholder="Owner"
            />
            <input
              className="input"
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
            />
            <button className="button-primary" onClick={() => add("task")}>
              Add
            </button>
          </div>
          {data.tasks.map((x: any) => (
            <CheckRow
              key={x.id}
              item={{
                ...x,
                label: `${x.title}${x.owner_name ? ` — ${x.owner_name}` : ""}${x.due_date ? ` · ${x.due_date}` : ""}`,
              }}
              onToggle={async (completed) => {
                await toggleFn({
                  data: { opportunity_id: opportunityId, kind: "task", id: x.id, completed },
                });
                await refresh();
              }}
            />
          ))}
        </Section>
      </div>

      <Section title="Information memorandum">
        <label className="button-secondary cursor-pointer">
          <Paperclip className="h-4 w-4" />
          Upload PDF, DOCX or XLSX
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.docx,.xlsx"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        {data.documents.map((d: any) => (
          <div key={d.id} className="mt-2 flex items-center gap-2 rounded border p-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{d.file_name}</span>
            <button onClick={() => openDocument(d)}>
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => removeDocument(d)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        ))}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Private notes and timeline">
          <QuickAdd
            value={note}
            setValue={setNote}
            action={() => add("note")}
            placeholder="Add a private note"
          />
          {data.notes.map((n: any) => (
            <div key={n.id} className="mt-2 rounded border p-2 text-xs">
              <div className="whitespace-pre-wrap">{n.note_text}</div>
              <span className="text-muted-foreground">
                {new Date(n.entered_at).toLocaleString()}
              </span>
            </div>
          ))}
        </Section>
        <Section title="Stage and listing history">
          {data.stage_history.map((h: any) => (
            <div key={h.id} className="mt-2 text-xs">
              <b>
                {h.from_stage ? `${STAGE_LABEL[h.from_stage]} → ` : "Created in "}
                {STAGE_LABEL[h.to_stage]}
              </b>
              <div className="text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</div>
            </div>
          ))}
          {data.listing_history.map((h: any) => (
            <div key={h.id} className="mt-2 text-xs">
              Listing: {h.listing_status} · {h.source}
            </div>
          ))}
        </Section>
      </div>
      <style>{`.input{border:1px solid var(--input);border-radius:6px;background:var(--background);padding:8px 10px;font-size:14px}.button-primary,.button-secondary{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:6px;padding:8px 12px;font-size:13px;font-weight:500}.button-primary{background:var(--primary);color:var(--primary-foreground)}.button-secondary{border:1px solid var(--input);background:var(--background)}`}</style>
    </DrawerFrame>
  );
}

function DrawerFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <aside className="ml-auto h-full w-full max-w-5xl overflow-y-auto bg-background p-5 shadow-xl">
        <button
          onClick={onClose}
          className="sticky top-0 z-10 ml-auto block rounded bg-background p-2"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </aside>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-xl border bg-card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs">
      {label}
      <input
        className="input mt-1 w-full"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly string[])[];
}) {
  return (
    <label className="text-xs">
      {label}
      <select
        className="input mt-1 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
function QuickAdd({
  value,
  setValue,
  action,
  placeholder,
}: {
  value: string;
  setValue: (v: string) => void;
  action: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        className="input min-w-0 flex-1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
      <button className="button-primary" onClick={action}>
        Add
      </button>
    </div>
  );
}
function CheckRow({ item, onToggle }: { item: any; onToggle: (v: boolean) => void }) {
  return (
    <label className="mt-2 flex gap-2 rounded border p-2 text-xs">
      <input
        type="checkbox"
        checked={item.completed}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className={item.completed ? "line-through text-muted-foreground" : ""}>
        {item.label}
      </span>
    </label>
  );
}
