/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getMyProfile, listMyOrgs } from "@/lib/orgs.functions";
import {
  calibrationCsvTemplate,
  createCalibrationObservation,
  importCalibrationCsv,
  listCalibrationWorkspace,
  updateCalibrationReview,
} from "@/lib/calibration-workspace";

export const Route = createFileRoute("/app/calibration")({
  head: () => ({
    meta: [
      { title: "Calibration evidence — Chemist Care" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalibrationPage,
});

const EMPTY_FORM = {
  pharmacy_id: "",
  observed_scripts_per_day: "",
  evidence_period_start: "",
  evidence_period_end: "",
  trading_days_per_week: "6",
  includes_private_prescriptions: "unknown",
  includes_under_copayment: "unknown",
  includes_daa_volume: "unknown",
  includes_institutional_supply: "unknown",
  source_type: "",
  source: "",
  source_document_or_note: "",
  confidence: "medium",
  inclusion_notes: "",
  exclusion_notes: "",
};

function CalibrationPage() {
  const profileFn = useServerFn(getMyProfile);
  const orgsFn = useServerFn(listMyOrgs);
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const workspace = useQuery({
    queryKey: ["calibration-workspace"],
    queryFn: listCalibrationWorkspace,
  });
  const orgName =
    (orgs.data ?? []).find((row) => row.id === profile.data?.current_organisation_id)?.name ?? null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [batchNote, setBatchNote] = useState("");
  const observations = workspace.data?.observations ?? [];
  const uniquePharmacies = new Set(observations.map((row: any) => row.pharmacy_id)).size;
  const verified = observations.filter((row: any) => row.review_status === "verified").length;
  const warnings = new Map(
    (workspace.data?.warnings ?? []).map((warning: any) => [warning.observation_id, warning]),
  );
  const readiness = useMemo(() => {
    if (uniquePharmacies < 10)
      return {
        label: "Relative model only",
        detail: "Fewer than 10 genuine pharmacies. Predictive fitting is disabled.",
      };
    if (uniquePharmacies < 30)
      return {
        label: "Experimental calibration cohort",
        detail: "Low confidence. Validation and geographic diversity checks are still required.",
      };
    return {
      label: "Validation may be considered",
      detail:
        "Moderate confidence is not automatic. Documented holdout or cross-validation error is required.",
    };
  }, [uniquePharmacies]);

  async function saveManual() {
    try {
      if (!form.pharmacy_id) throw new Error("Choose a pharmacy.");
      if (!form.observed_scripts_per_day || Number(form.observed_scripts_per_day) <= 0)
        throw new Error("Enter a positive scripts/day observation.");
      if (!form.evidence_period_start || !form.evidence_period_end)
        throw new Error("Enter the complete evidence period.");
      if (form.evidence_period_end < form.evidence_period_start)
        throw new Error("Evidence period end cannot precede start.");
      const triState = (value: string) => (value === "unknown" ? null : value === "included");
      await createCalibrationObservation({
        pharmacy_id: form.pharmacy_id,
        observed_scripts_per_day: Number(form.observed_scripts_per_day),
        evidence_period_start: form.evidence_period_start,
        evidence_period_end: form.evidence_period_end,
        trading_days_per_week: Number(form.trading_days_per_week),
        includes_private_prescriptions: triState(form.includes_private_prescriptions),
        includes_under_copayment: triState(form.includes_under_copayment),
        includes_daa_volume: triState(form.includes_daa_volume),
        includes_institutional_supply: triState(form.includes_institutional_supply),
        source_type: form.source_type,
        source: form.source,
        source_document_or_note: form.source_document_or_note,
        confidence: form.confidence as "low" | "medium" | "high",
        inclusion_notes: form.inclusion_notes,
        exclusion_notes: form.exclusion_notes,
      });
      setForm(EMPTY_FORM);
      await workspace.refetch();
      toast.success("Genuine calibration evidence saved as unreviewed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function importCsv() {
    if (!file) return toast.error("Choose a CSV file.");
    try {
      const result = await importCalibrationCsv(file.name, await file.text(), batchNote);
      setFile(null);
      setBatchNote("");
      await workspace.refetch();
      toast.success(
        `${result.imported} imported; ${result.quarantined.length} quarantined for review`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    }
  }

  function downloadTemplate() {
    const blob = new Blob([calibrationCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "genuine-dispensing-calibration-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function review(id: string, status: "in_review" | "verified" | "rejected") {
    try {
      const notes = window.prompt("Review note (recommended):") ?? "";
      await updateCalibrationReview(id, status, notes);
      await workspace.refetch();
      toast.success(`Evidence marked ${status.replace("_", " ")}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review update failed");
    }
  }

  return (
    <AppShell currentOrgName={orgName}>
      <main className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-semibold">Calibration evidence workspace</h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          Securely record genuine actual dispensing evidence. These records remain private to the
          current organisation and do not turn Geographic Dispensing Potential into actual volume.
        </p>

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <Stat label="Genuine observations" value={observations.length} />
          <Stat label="Distinct pharmacies" value={uniquePharmacies} />
          <Stat label="Verified observations" value={verified} />
          <Stat
            label="Model fitting"
            value={uniquePharmacies < 10 ? "Disabled" : "Not automatic"}
          />
        </section>
        <section className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <b>{readiness.label}</b>
          <div>{readiness.detail}</div>
          <div>
            Current calibration sample: {uniquePharmacies} genuine pharmacies. No predictive
            accuracy is claimed, and no model is described as trained.
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Manual evidence entry</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Unknown inclusion status stays unknown; it is never converted to excluded or zero.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-xs">Pharmacy</span>
                <select
                  className="input mt-1 w-full"
                  value={form.pharmacy_id}
                  onChange={(event) => setForm({ ...form, pharmacy_id: event.target.value })}
                >
                  <option value="">Choose a mapped pharmacy</option>
                  {(workspace.data?.pharmacies ?? []).map((pharmacy: any) => (
                    <option key={pharmacy.id} value={pharmacy.id}>
                      {pharmacy.name} — {pharmacy.suburb ?? pharmacy.address}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Average scripts per trading day"
                type="number"
                value={form.observed_scripts_per_day}
                onChange={(value) => setForm({ ...form, observed_scripts_per_day: value })}
              />
              <Field
                label="Trading days per week"
                type="number"
                value={form.trading_days_per_week}
                onChange={(value) => setForm({ ...form, trading_days_per_week: value })}
              />
              <Field
                label="Evidence period start"
                type="date"
                value={form.evidence_period_start}
                onChange={(value) => setForm({ ...form, evidence_period_start: value })}
              />
              <Field
                label="Evidence period end"
                type="date"
                value={form.evidence_period_end}
                onChange={(value) => setForm({ ...form, evidence_period_end: value })}
              />
              {[
                ["includes_private_prescriptions", "Private prescriptions"],
                ["includes_under_copayment", "Under co-payment prescriptions"],
                ["includes_daa_volume", "Dose-administration-aid volume"],
                ["includes_institutional_supply", "Nursing-home or institutional supply"],
              ].map(([key, label]) => (
                <TriState
                  key={key}
                  label={label}
                  value={(form as any)[key]}
                  onChange={(value) => setForm({ ...form, [key]: value })}
                />
              ))}
              <Field
                label="Source type"
                value={form.source_type}
                onChange={(value) => setForm({ ...form, source_type: value })}
              />
              <Field
                label="Source / provenance"
                value={form.source}
                onChange={(value) => setForm({ ...form, source: value })}
              />
              <Field
                label="Source document or note"
                value={form.source_document_or_note}
                onChange={(value) => setForm({ ...form, source_document_or_note: value })}
              />
              <label>
                <span className="text-xs">Evidence confidence</span>
                <select
                  className="input mt-1 w-full"
                  value={form.confidence}
                  onChange={(event) => setForm({ ...form, confidence: event.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <Field
                label="Inclusion definition"
                value={form.inclusion_notes}
                onChange={(value) => setForm({ ...form, inclusion_notes: value })}
              />
              <Field
                label="Exclusion definition"
                value={form.exclusion_notes}
                onChange={(value) => setForm({ ...form, exclusion_notes: value })}
              />
            </div>
            <button className="btn mt-4 bg-primary text-primary-foreground" onClick={saveManual}>
              Save unreviewed evidence
            </button>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">CSV import</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Invalid rows are quarantined and counted. No placeholder or example observations are
              inserted.
            </p>
            <button className="btn mt-4" onClick={downloadTemplate}>
              Download blank CSV template
            </button>
            <input
              className="mt-4 block w-full text-sm"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <textarea
              className="input mt-3 min-h-24 w-full"
              placeholder="Batch source or provenance note"
              value={batchNote}
              onChange={(event) => setBatchNote(event.target.value)}
            />
            <button className="btn mt-3 bg-primary text-primary-foreground" onClick={importCsv}>
              Validate and import
            </button>
            <h3 className="mt-6 text-sm font-semibold">Recent imports</h3>
            <div className="mt-2 space-y-2 text-xs">
              {(workspace.data?.batches ?? []).map((batch: any) => (
                <div key={batch.id} className="rounded border p-2">
                  <b>{batch.file_name}</b> · {batch.rows_imported} imported ·{" "}
                  {batch.rows_quarantined} quarantined
                  <div className="text-muted-foreground">
                    {new Date(batch.imported_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {workspace.data?.batches?.length === 0 && (
                <div className="text-muted-foreground">No CSV imports recorded.</div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[1250px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Pharmacy / period</th>
                <th>Actual evidence</th>
                <th>Definitions</th>
                <th>Provenance</th>
                <th>Warnings</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((row: any) => {
                const warning = warnings.get(row.id) as any;
                return (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-3">
                      <b>{row.pharmacy_premises?.name ?? row.pharmacy_id}</b>
                      <div>{row.pharmacy_premises?.suburb}</div>
                      <div>
                        {row.evidence_period_start}–{row.evidence_period_end}
                      </div>
                    </td>
                    <td className="p-3">
                      {row.observed_scripts_per_day} scripts/trading day
                      <div>{row.trading_days_per_week} trading days/week</div>
                    </td>
                    <td className="p-3 text-xs">
                      {definitionSummary(row)}
                      <div>Includes: {row.inclusion_notes || "No narrative supplied"}</div>
                      <div>Excludes: {row.exclusion_notes || "No narrative supplied"}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <b>{row.source_type}</b> · {row.confidence}
                      <div>{row.source}</div>
                      <div>{row.source_document_or_note}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {(warning?.overlap_count ?? 0) > 0 && (
                        <div className="text-amber-700">
                          Overlaps {warning.overlap_count} other period(s)
                        </div>
                      )}
                      {(warning?.inconsistent_inclusion_count ?? 0) > 0 && (
                        <div className="text-amber-700">Inclusion definitions differ</div>
                      )}
                      {(warning?.overlap_count ?? 0) === 0 &&
                        (warning?.inconsistent_inclusion_count ?? 0) === 0 &&
                        "No automated warning"}
                    </td>
                    <td className="p-3">
                      <b>{row.review_status.replace("_", " ")}</b>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button className="btn text-xs" onClick={() => review(row.id, "in_review")}>
                          Review
                        </button>
                        <button className="btn text-xs" onClick={() => review(row.id, "verified")}>
                          Verify
                        </button>
                        <button className="btn text-xs" onClick={() => review(row.id, "rejected")}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {observations.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Zero genuine observations. The model remains relative and predictive fitting is
                    disabled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      <span className="text-xs">{label}</span>
      <input
        className="input mt-1 w-full"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs">{label}</span>
      <select
        className="input mt-1 w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="unknown">Unknown</option>
        <option value="included">Included</option>
        <option value="excluded">Excluded</option>
      </select>
    </label>
  );
}

function definitionSummary(row: any) {
  const label = (value: boolean | null) =>
    value == null ? "unknown" : value ? "included" : "excluded";
  return [
    `Private ${label(row.includes_private_prescriptions)}`,
    `under co-payment ${label(row.includes_under_copayment)}`,
    `DAA ${label(row.includes_daa_volume)}`,
    `institutional ${label(row.includes_institutional_supply)}`,
  ].join(" · ");
}
