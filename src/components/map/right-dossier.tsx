/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, MapPin, Bookmark, Navigation, Paperclip, Eye, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchDossier } from "@/lib/premises-public";
import {
  deleteImAttachment,
  fetchPharmacyProfileBundle,
  getCurrentOrganisationId,
  type PharmacyProfileBundle,
  type PharmacyStatus,
  registerImAttachment,
  savePharmacyNotes,
  upsertPharmacyProfile,
} from "@/lib/pharmacy-profiles.public";
import {
  addPharmacyToPipeline,
  fetchPharmacyPipelineStatus,
  type PharmacyPipelineStatus,
} from "@/lib/pharmacy-pipeline";
import { VerificationBadge, EvidenceBadge } from "@/components/verification-badge";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCalibrationSummary,
  fetchDispensingPotential,
  potentialBand,
  saveCalibrationObservation,
} from "@/lib/dispensing-potential";

const STATUS_OPTIONS: Array<{ value: PharmacyStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "underperforming", label: "Underperforming" },
  { value: "target", label: "Target" },
  { value: "under_offer", label: "Under offer" },
];

export function RightDossier({
  premisesId,
  onClose,
  onRequireAuth,
  authed,
}: {
  premisesId: string | null;
  onClose: () => void;
  onRequireAuth: (reason: string) => void;
  authed: boolean;
}) {
  const dossierQuery = useQuery({
    queryKey: ["pharmacy-dossier", premisesId],
    queryFn: ({ signal }) => fetchDossier(premisesId!, signal),
    enabled: premisesId != null,
    staleTime: 10 * 60 * 1000,
  });
  const dossier = dossierQuery.data;

  if (!premisesId) return null;

  return (
    <aside className="pointer-events-auto absolute right-3 top-16 bottom-3 z-[1000] flex w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pharmacy discovery record
          </div>
          <h2 className="mt-1 truncate text-base font-semibold tracking-tight">
            {dossier?.name ?? "Loading…"}
          </h2>
          {dossier && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {dossier.address}
              {dossier.suburb ? `, ${dossier.suburb}` : ""} {dossier.postcode ?? ""}
            </p>
          )}
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {dossierQuery.isLoading && !dossier && (
          <div className="text-xs text-muted-foreground">Loading dossier…</div>
        )}
        {dossierQuery.isError && (
          <div className="text-xs text-destructive">Dossier could not be loaded.</div>
        )}
        {dossier && (
          <>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Verification
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <VerificationBadge
                  status={dossier.vpa_registration_status}
                  label={`VPA: ${labelForStatus(dossier.vpa_registration_status)}`}
                />
                {dossier.pbs_approvals.length ? (
                  dossier.pbs_approvals.map((a) => (
                    <VerificationBadge
                      key={a.approval_number}
                      status={a.approval_status as never}
                      label={`PBS #${a.approval_number}`}
                    />
                  ))
                ) : (
                  <EvidenceBadge kind="missing">PBS approval unknown</EvidenceBadge>
                )}
              </div>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Overview
              </h3>
              <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {dossier.phone && (
                  <div>
                    Phone <span className="text-foreground">{dossier.phone}</span>
                  </div>
                )}
                {dossier.website && (
                  <div>
                    Website{" "}
                    <a
                      href={dossier.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2"
                    >
                      {dossier.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
                <div>
                  Coordinates{" "}
                  <span className="text-foreground">
                    {dossier.lat.toFixed(5)}, {dossier.lng.toFixed(5)}
                  </span>
                </div>
              </div>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source
              </h3>
              <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                <div>
                  <span className="text-foreground">{dossier.source_name ?? "Manual entry"}</span>
                  {dossier.source_confidence && ` · confidence: ${dossier.source_confidence}`}
                </div>
                {dossier.geocode_method && (
                  <div>
                    Geocode method{" "}
                    <span className="text-foreground">
                      {formatGeocodeMethod(dossier.geocode_method)}
                    </span>
                  </div>
                )}
                {(dossier.source_confidence === "approximate" ||
                  dossier.geocode_method === "suburb_centroid") && (
                  <div className="text-amber">
                    Approximate map point only. Street-front location still needs confirmation.
                  </div>
                )}
                {dossier.source_fetched_at && (
                  <div>Fetched {new Date(dossier.source_fetched_at).toLocaleDateString()}</div>
                )}
              </div>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nearby market signals
              </h3>
              <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                  Medical centres — no source coverage for this area
                </div>
                <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                  Supermarkets — no source coverage for this area
                </div>
                <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                  Local population — no source coverage for this area
                </div>
              </div>
            </section>
            <DispensingPotentialSection premisesId={premisesId} authed={authed} />

            <PrivateWorkspace authed={authed} premisesId={premisesId} />
          </>
        )}
      </div>

      <div className="border-t border-border bg-muted/40 p-3">
        <div className="grid grid-cols-2 gap-2">
          <PipelineAction authed={authed} premisesId={premisesId} onRequireAuth={onRequireAuth} />
          <button
            onClick={() =>
              authed
                ? window.location.assign("/app/acquisitions")
                : onRequireAuth("Sign in to analyse a relocation scenario.")
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
          >
            <Navigation className="h-3.5 w-3.5" /> Relocate
          </button>
        </div>
      </div>
    </aside>
  );
}

function DispensingPotentialSection({
  premisesId,
  authed,
}: {
  premisesId: string;
  authed: boolean;
}) {
  const potential = useQuery({
    queryKey: ["dispensing-potential", premisesId],
    queryFn: () => fetchDispensingPotential(premisesId),
  });
  const calibration = useQuery({
    queryKey: ["dispensing-calibration", premisesId],
    queryFn: () => fetchCalibrationSummary(premisesId),
    enabled: authed,
  });
  const p = potential.data as any;
  const metrics = p?.raw_metrics ?? {},
    components = p?.component_scores ?? {};
  const actual = calibration.data?.observations?.[0];
  const sample = calibration.data?.sampleSize ?? 0;
  const ratio =
    actual && p?.experimental_scripts_day_equivalent
      ? Number(actual.observed_scripts_per_day) / Number(p.experimental_scripts_day_equivalent)
      : null;
  return (
    <section className="mt-4 rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Geographic Dispensing Potential
      </h3>
      {!p ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Relative rating is awaiting the next server-side refresh.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between">
            <b>{potentialBand(p.victorian_percentile)}</b>
            <span className="text-xs">
              {p.victorian_percentile == null
                ? "Victorian percentile unavailable"
                : `${p.victorian_percentile}th Victorian percentile`}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Metric label="Demand pressure" value={components.demand_pressure} />
            <Metric label="Competitive position" value={components.competitive_position} />
            <Metric label="Healthcare anchors" value={components.healthcare_anchors} />
            <Metric label="Retail anchors" value={components.retail_anchors} />
            <Metric label="Growth outlook" value={components.growth_outlook} />
            <Metric label="Evidence confidence" value={p.evidence_confidence} />
          </div>
          <div className="mt-2 rounded bg-muted p-2 text-xs">
            <b>Experimental scripts/day equivalent</b>
            <div>
              {p.experimental_scripts_day_equivalent ??
                "Not calibrated against enough known pharmacies"}
            </div>
            <div>
              Theoretical scripts/day range:{" "}
              {p.theoretical_scripts_day_low == null
                ? "Not yet available"
                : `${p.theoretical_scripts_day_low}–${p.theoretical_scripts_day_high}`}
            </div>
            <div>
              Calibration sample size: {sample} ·{" "}
              {sample < 10
                ? "relative model only; very low calibration confidence"
                : sample < 30
                  ? "experimental model; low confidence"
                  : "validation required before moderate confidence"}
            </div>
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-medium">Explain this rating</summary>
            <div className="mt-2">
              Model: {p.dispensing_potential_methods?.version} · calculated{" "}
              {new Date(p.calculated_at).toLocaleString()}
            </div>
            <div>
              Raw metrics:{" "}
              <pre className="whitespace-pre-wrap">{JSON.stringify(metrics, null, 2)}</pre>
            </div>
            <div>Missing inputs: {(p.missing_inputs ?? []).join(", ") || "None recorded"}</div>
            <div>Warnings: {(p.warnings ?? []).join("; ")}</div>
            <div>
              Actual dispensing may differ materially because of hours, service mix, institutional
              supply, reputation, access and operations.
            </div>
          </details>
          {actual && (
            <div className="mt-2 rounded border p-2 text-xs">
              <b>Actual versus theoretical performance</b>
              <div>Actual scripts/day: {actual.observed_scripts_per_day}</div>
              <div>
                Actual-to-theoretical ratio:{" "}
                {ratio == null ? "Insufficient evidence" : ratio.toFixed(2)}
              </div>
              <div>
                {ratio == null
                  ? "Insufficient evidence"
                  : ratio < 0.8
                    ? "Materially below geographic potential"
                    : ratio > 1.2
                      ? "Materially above geographic potential"
                      : "Broadly aligned with geographic potential"}{" "}
                — this does not establish operational quality.
              </div>
            </div>
          )}
          {authed && (
            <CalibrationForm pharmacyId={premisesId} onSaved={() => calibration.refetch()} />
          )}
        </>
      )}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border p-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-semibold">{value == null ? "Unknown" : String(value)}</div>
    </div>
  );
}
function CalibrationForm({ pharmacyId, onSaved }: { pharmacyId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false),
    [value, setValue] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [days, setDays] = useState("6"),
    [source, setSource] = useState(""),
    [notes, setNotes] = useState(""),
    [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium"),
    [privateIncluded, setPrivateIncluded] = useState(false),
    [underCopaymentIncluded, setUnderCopaymentIncluded] = useState(false),
    [daaIncluded, setDaaIncluded] = useState(false),
    [institutionalIncluded, setInstitutionalIncluded] = useState(false);
  async function save() {
    try {
      await saveCalibrationObservation({
        pharmacy_id: pharmacyId,
        observed_scripts_per_day: Number(value),
        evidence_period_start: start,
        evidence_period_end: end,
        trading_days_per_week: Number(days),
        includes_private_prescriptions: privateIncluded,
        includes_under_copayment: underCopaymentIncluded,
        includes_daa_volume: daaIncluded,
        includes_institutional_supply: institutionalIncluded,
        source_type: source,
        source_document_or_note: notes || null,
        confidence,
      });
      toast.success("Genuine calibration observation saved");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }
  return (
    <div className="mt-2 text-xs">
      <button className="underline" onClick={() => setOpen(!open)}>
        Add genuine actual scripts/day evidence
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="Average per trading day"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <input
            className="input"
            placeholder="Trading days/week"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <input
            className="input col-span-2"
            placeholder="Source type"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <select
            className="input"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as typeof confidence)}
          >
            <option value="low">Low confidence</option>
            <option value="medium">Medium confidence</option>
            <option value="high">High confidence</option>
          </select>
          <textarea
            className="input col-span-2"
            placeholder="Source document reference or notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {[
            ["Private prescriptions included", privateIncluded, setPrivateIncluded],
            ["Under co-payment included", underCopaymentIncluded, setUnderCopaymentIncluded],
            ["DAA volume included", daaIncluded, setDaaIncluded],
            ["Institutional supply included", institutionalIncluded, setInstitutionalIncluded],
          ].map(([label, checked, setter]) => (
            <label key={String(label)} className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)}
              />
              {String(label)}
            </label>
          ))}
          <button
            className="col-span-2 rounded bg-primary p-2 text-primary-foreground"
            onClick={save}
          >
            Save evidence
          </button>
        </div>
      )}
    </div>
  );
}

function PipelineAction({
  authed,
  premisesId,
  onRequireAuth,
}: {
  authed: boolean;
  premisesId: string;
  onRequireAuth: (reason: string) => void;
}) {
  const [status, setStatus] = useState<PharmacyPipelineStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authed) {
      setStatus(null);
      return;
    }
    fetchPharmacyPipelineStatus(premisesId)
      .then(setStatus)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to check pipeline"),
      );
  }, [authed, premisesId]);

  async function handleClick() {
    if (!authed) {
      onRequireAuth("Sign in to add this pharmacy to your private acquisition pipeline.");
      return;
    }
    if (status) {
      window.location.assign(`/app/acquisitions?opportunity=${status.opportunity_id}`);
      return;
    }
    setBusy(true);
    try {
      const created = await addPharmacyToPipeline(premisesId);
      toast.success(created?.created ? "Added to acquisition pipeline" : "Pipeline record updated");
      setStatus(await fetchPharmacyPipelineStatus(premisesId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add to pipeline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      <Bookmark className="h-3.5 w-3.5" />
      {busy ? "Adding…" : status ? "View in acquisition pipeline" : "Add to acquisition pipeline"}
    </button>
  );
}

function PrivateWorkspace({ authed, premisesId }: { authed: boolean; premisesId: string }) {
  const [profileData, setProfileData] = useState<PharmacyProfileBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const notesTimer = useRef<number | null>(null);

  const [status, setStatus] = useState<PharmacyStatus>("active");
  const [askingPrice, setAskingPrice] = useState("");
  const [revenue, setRevenue] = useState("");
  const [scriptVolume, setScriptVolume] = useState("");
  const [ownerLicensee, setOwnerLicensee] = useState("");
  const [notes, setNotes] = useState("");
  const [notesState, setNotesState] = useState<"idle" | "saving" | "saved">("idle");

  async function loadProfile() {
    if (!authed) return;
    const next = await fetchPharmacyProfileBundle(premisesId);
    setProfileData(next);
    const profile = next.profile;
    setStatus((profile.status as PharmacyStatus) ?? "active");
    setAskingPrice(toInputValue(profile.asking_price));
    setRevenue(toInputValue(profile.revenue));
    setScriptVolume(toInputValue(profile.script_volume));
    setOwnerLicensee(profile.owner_licensee ?? "");
    setNotes(profile.notes ?? "");
    setPreviewUrl(null);
    setPreviewName(null);
    setNotesState("idle");
  }

  useEffect(() => {
    loadProfile().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load private profile");
    });
    return () => {
      if (notesTimer.current) window.clearTimeout(notesTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, premisesId]);

  const notesUpdatedLabel = useMemo(() => {
    const stamp = profileData?.profile?.notes_updated_at;
    return stamp ? `Last saved ${new Date(stamp).toLocaleString()}` : "No saved notes yet";
  }, [profileData]);

  async function saveCommercialFields() {
    setBusy(true);
    try {
      await upsertPharmacyProfile({
        premises_id: premisesId,
        status,
        asking_price: toNullableNumber(askingPrice),
        revenue: toNullableNumber(revenue),
        script_volume: toNullableInteger(scriptVolume),
        owner_licensee: ownerLicensee.trim() || null,
      });
      toast.success("Private fields saved");
      await loadProfile();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function queueNotesSave(nextNotes: string) {
    setNotes(nextNotes);
    setNotesState("saving");
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(async () => {
      try {
        await savePharmacyNotes({ premises_id: premisesId, notes: nextNotes });
        setNotesState("saved");
        await loadProfile();
      } catch (error) {
        setNotesState("idle");
        toast.error(error instanceof Error ? error.message : "Failed to save notes");
      }
    }, 800);
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        validateCommercialFile(file);
        const organisationId = await getCurrentOrganisationId();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const storagePath = `${organisationId}/${premisesId}/${Date.now()}-${safeName}`;
        const upload = await supabase.storage
          .from("information-memorandums")
          .upload(storagePath, file, { upsert: false });
        if (upload.error) throw upload.error;

        await registerImAttachment({
          premises_id: premisesId,
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
      }
      toast.success("Attachment uploaded");
      await loadProfile();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(storagePath: string, fileName: string, inline: boolean) {
    try {
      const { data, error } = await supabase.storage
        .from("information-memorandums")
        .createSignedUrl(
          storagePath,
          60 * 30,
          inline ? { download: false } : { download: fileName },
        );
      if (error) throw error;
      if (inline && fileName.toLowerCase().endsWith(".pdf")) {
        setPreviewUrl(data.signedUrl);
        setPreviewName(fileName);
      } else {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open attachment");
    }
  }

  async function removeAttachment(id: string, storagePath: string) {
    try {
      const { error: storageError } = await supabase.storage
        .from("information-memorandums")
        .remove([storagePath]);
      if (storageError) throw storageError;
      await deleteImAttachment(id);
      toast.success("Attachment removed");
      await loadProfile();
      if (previewUrl && profileData?.attachments.some((item) => item.id === id)) {
        setPreviewUrl(null);
        setPreviewName(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete attachment");
    }
  }

  if (!authed) {
    return (
      <section className="mt-5 rounded-lg border border-border bg-muted/20 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Private organisation workspace
        </div>
        <p className="mt-2 rounded-md border border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
          Sign in and choose an organisation to access commercial fields, private notes and
          information memorandums.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Private organisation workspace
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{notesUpdatedLabel}</div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {notesState === "saving" ? "Saving notes…" : notesState === "saved" ? "Notes saved" : ""}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PharmacyStatus)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Script volume</span>
          <input
            value={scriptVolume}
            onChange={(e) => setScriptVolume(e.target.value)}
            inputMode="numeric"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            placeholder="Weekly or monthly"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Asking price</span>
          <input
            value={askingPrice}
            onChange={(e) => setAskingPrice(e.target.value)}
            inputMode="decimal"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            placeholder="A$"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Revenue</span>
          <input
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            inputMode="decimal"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            placeholder="A$"
          />
        </label>
      </div>

      <label className="mt-2 block text-xs">
        <span className="mb-1 block text-muted-foreground">Owner / licensee</span>
        <input
          value={ownerLicensee}
          onChange={(e) => setOwnerLicensee(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          placeholder="Owner or licensee"
        />
      </label>

      <div className="mt-2 flex justify-end">
        <button
          onClick={saveCommercialFields}
          disabled={busy}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save details"}
        </button>
      </div>

      <label className="mt-3 block text-xs">
        <span className="mb-1 block text-muted-foreground">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => queueNotesSave(e.target.value)}
          rows={7}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Broker comments, risks, legal issues, strengths, nearby competitors, and follow-up tasks."
        />
      </label>

      <div className="mt-3 rounded-md border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-foreground">Information memorandums</div>
            <div className="text-[11px] text-muted-foreground">
              Upload PDFs, DOCX files, or spreadsheets against this pharmacy.
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
            <Paperclip className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        </div>

        <div className="mt-3 space-y-2">
          {(profileData?.attachments ?? []).map((item) => (
            <div key={item.id} className="rounded-md border border-border px-2.5 py-2 text-xs">
              <div className="font-medium text-foreground">{item.file_name}</div>
              <div className="mt-1 text-muted-foreground">
                {formatBytes(item.size_bytes)} · {new Date(item.created_at).toLocaleString()}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.file_name.toLowerCase().endsWith(".pdf") && (
                  <button
                    onClick={() => openAttachment(item.storage_path, item.file_name, true)}
                    className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-accent"
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                )}
                <button
                  onClick={() => openAttachment(item.storage_path, item.file_name, false)}
                  className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-accent"
                >
                  <Download className="h-3 w-3" />
                  Download
                </button>
                <button
                  onClick={() => removeAttachment(item.id, item.storage_path)}
                  className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-destructive hover:bg-accent"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
            </div>
          ))}
          {!profileData?.attachments?.length && (
            <div className="rounded-md border border-dashed border-border px-2.5 py-3 text-xs text-muted-foreground">
              No IM files uploaded yet.
            </div>
          )}
        </div>

        {previewUrl && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
              PDF preview: {previewName}
            </div>
            <iframe
              src={previewUrl}
              title={previewName ?? "PDF preview"}
              className="h-72 w-full rounded-md border border-border bg-background"
            />
          </div>
        )}
      </div>

      {(profileData?.notesHistory?.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent note saves
          </div>
          <div className="mt-2 space-y-2">
            {profileData?.notesHistory.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border bg-background px-2.5 py-2"
              >
                <div className="text-[11px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </div>
                <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-foreground">
                  {item.note_text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function labelForStatus(s: string) {
  return s === "verified"
    ? "Verified"
    : s === "matched"
      ? "Matched"
      : s === "conflict"
        ? "Conflict"
        : "Unverified";
}

function formatGeocodeMethod(value: string) {
  return value.replaceAll("_", " ");
}

function validateCommercialFile(file: File) {
  const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error("Only PDF, DOCX and XLSX information memorandums are accepted.");
  }
  if (file.size < 1 || file.size > 25 * 1024 * 1024) {
    throw new Error("Information memorandums must be between 1 byte and 25 MB.");
  }
  if (/\.(exe|com|bat|cmd|scr|js|jse|vbs|vbe|msi|ps1|sh)(\.|$)/i.test(file.name)) {
    throw new Error("Executable or script files are not accepted.");
  }
  if (/\.(pdf|docx|xlsx)\.(pdf|docx|xlsx)$/i.test(file.name)) {
    throw new Error("Misleading double extensions are not accepted.");
  }
}

function toNullableNumber(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInteger(value: string) {
  const cleaned = value.replace(/[^0-9-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isInteger(parsed) ? parsed : null;
}

function toInputValue(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function formatBytes(value: number | null) {
  if (!value) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
