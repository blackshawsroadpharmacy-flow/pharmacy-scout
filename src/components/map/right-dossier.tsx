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
import { IM_SIGNED_URL_TTL_SECONDS } from "@/lib/storage-constants";
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
  fetchDispensingPotentialComparison,
  potentialBand,
  saveCalibrationObservation,
} from "@/lib/dispensing-potential";
import { fetchPharmacyDemographics } from "@/lib/demographic-intelligence";
import { fetchHealthcareDemand } from "@/lib/healthcare-anchors";
import {
  registeredLicenseeSummary,
  vpaDisplayDate,
  vpaRegistrationDueWording,
} from "@/lib/vpa-profile-presentation";

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
            <PharmacyIntelligence
              premisesId={premisesId}
              lat={dossier.lat}
              lng={dossier.lng}
              authed={authed}
            />

            <section className="mt-5">
              <SectionLabel>Verification &amp; regulatory status</SectionLabel>
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

            <OfficialRegistration dossier={dossier} />
            <RegisteredLicensees licensees={dossier.registered_licensees} />

            <section className="mt-5">
              <SectionLabel>Contact &amp; provenance</SectionLabel>
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
                <div>
                  Source{" "}
                  <span className="text-foreground">{dossier.source_name ?? "Manual entry"}</span>
                  {dossier.source_confidence && ` · ${dossier.source_confidence} confidence`}
                  {dossier.geocode_method &&
                    ` · geocoded by ${formatGeocodeMethod(dossier.geocode_method)}`}
                  {dossier.source_fetched_at &&
                    ` · fetched ${new Date(dossier.source_fetched_at).toLocaleDateString()}`}
                </div>
                {(dossier.source_confidence === "approximate" ||
                  dossier.geocode_method === "suburb_centroid") && (
                  <div className="text-amber">
                    Approximate map point only. Street-front location still needs confirmation.
                  </div>
                )}
              </div>
            </section>

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

function OfficialRegistration({ dossier }: { dossier: Awaited<ReturnType<typeof fetchDossier>> }) {
  if (!dossier?.vpa_official_name && !dossier?.vpa_registration_status_raw) {
    return (
      <section className="mt-5">
        <SectionLabel>Official registration</SectionLabel>
        <p className="mt-2 text-xs text-muted-foreground">
          No matched VPA registration is available. PBS approval and VPA registration are separate
          source states.
        </p>
      </section>
    );
  }
  const due = vpaRegistrationDueWording(dossier.vpa_registered_until);
  return (
    <section className="mt-5" data-testid="official-registration">
      <SectionLabel>Official registration</SectionLabel>
      <dl className="mt-2 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Official VPA name</dt>
        <dd>{dossier.vpa_official_name ?? "Not published"}</dd>
        <dt className="text-muted-foreground">Official address</dt>
        <dd>{dossier.vpa_official_full_address ?? "Not published"}</dd>
        <dt className="text-muted-foreground">Source status</dt>
        <dd>{dossier.vpa_registration_status_raw ?? "Not published"}</dd>
        <dt className="text-muted-foreground">Normalised state</dt>
        <dd>{dossier.vpa_registration_status_normalised.replaceAll("_", " ")}</dd>
        <dt className="text-muted-foreground">Registered until</dt>
        <dd>{vpaDisplayDate(dossier.vpa_registered_until)}</dd>
        <dt className="text-muted-foreground">Conditions</dt>
        <dd className="break-words">{dossier.vpa_premises_conditions_raw ?? "None published"}</dd>
        <dt className="text-muted-foreground">Observed</dt>
        <dd>
          {dossier.vpa_first_observed_at
            ? new Date(dossier.vpa_first_observed_at).toLocaleDateString("en-AU")
            : "Unknown"}{" "}
          –{" "}
          {dossier.vpa_last_observed_at
            ? new Date(dossier.vpa_last_observed_at).toLocaleDateString("en-AU")
            : "Unknown"}
        </dd>
        <dt className="text-muted-foreground">VPA / PBS</dt>
        <dd>{dossier.vpa_pbs_match_state.replaceAll("_", " ")}</dd>
        <dt className="text-muted-foreground">Match review</dt>
        <dd>
          {dossier.vpa_match_status.replaceAll("_", " ")}
          {dossier.vpa_match_confidence != null
            ? ` · ${Math.round(dossier.vpa_match_confidence * 100)}%`
            : ""}
          {` · ${dossier.vpa_review_status.replaceAll("_", " ")}`}
        </dd>
        <dt className="text-muted-foreground">Geocoding</dt>
        <dd>{dossier.vpa_geocode_status.replaceAll("_", " ")}</dd>
      </dl>
      {due && <p className="mt-2 rounded-md bg-amber/10 p-2 text-xs text-amber">{due}</p>}
    </section>
  );
}

function RegisteredLicensees({
  licensees,
}: {
  licensees: NonNullable<Awaited<ReturnType<typeof fetchDossier>>>["registered_licensees"];
}) {
  const current = licensees.filter((licensee) => licensee.currently_observed);
  return (
    <section className="mt-5" data-testid="registered-licensees">
      <SectionLabel>Registered licensees</SectionLabel>
      {current.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{registeredLicenseeSummary(0)}</p>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            {registeredLicenseeSummary(current.length)}
          </p>
          {current.map((licensee) => (
            <article key={licensee.id} className="rounded-md border border-border p-2 text-xs">
              <div className="font-medium break-words">{licensee.licensee_name}</div>
              <div className="mt-1 text-muted-foreground">
                {licensee.license_status ?? "Status not published"} · licensed until{" "}
                {vpaDisplayDate(licensee.licensed_until)}
              </div>
              {licensee.conditions && (
                <div className="mt-1 break-words text-muted-foreground">{licensee.conditions}</div>
              )}
              <div className="mt-1 text-[11px] text-muted-foreground">
                First observed{" "}
                {licensee.first_observed_at
                  ? new Date(licensee.first_observed_at).toLocaleDateString("en-AU")
                  : "unknown"}
                . Actual ownership or supply relationships are not established by this register.
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Insight synthesis: turn the three sourced datasets into short, plain-English
// statements. Each is directional (support / limit / neutral) so the reader
// can scan what helps vs. what constrains the estimate. Everything is
// conditional on the underlying value actually being present — a missing input
// produces no insight rather than a fabricated zero.
// ---------------------------------------------------------------------------
type InsightTone = "support" | "limit" | "neutral";
interface Insight {
  tone: InsightTone;
  text: string;
}

const AGE65_STATE_MIDPOINT = 18; // model reference (gdp assumption age65_percent_centre)

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildInsights(p: any, demo: any, healthcare: any): Insight[] {
  const out: Insight[] = [];
  const raw = p?.raw_metrics ?? {};

  const population = num(raw.catchment_population_2km) ?? num(raw.surrounding_population_sa2_2024);
  if (population != null) {
    out.push({
      tone: "neutral",
      text: `~${Math.round(population).toLocaleString("en-AU")} people in the surrounding catchment`,
    });
  }

  const age65 = num(demo?.age_65_plus_percent);
  if (age65 != null) {
    const delta = age65 - AGE65_STATE_MIDPOINT;
    out.push({
      tone: delta >= 2 ? "support" : delta <= -2 ? "limit" : "neutral",
      text:
        `${age65.toFixed(1)}% aged 65+ ` +
        (delta >= 2
          ? `(older than the ~${AGE65_STATE_MIDPOINT}% state midpoint — higher script demand)`
          : delta <= -2
            ? `(younger than the ~${AGE65_STATE_MIDPOINT}% state midpoint)`
            : `(around the state midpoint)`),
    });
  }

  const assist = num(demo?.need_assistance_percent);
  if (assist != null && assist >= 6) {
    out.push({
      tone: "support",
      text: `${assist.toFixed(1)}% report a core-activity need for assistance`,
    });
  }

  const competitors = num(raw.pharmacies_2km);
  const nearest = num(raw.nearest_competing_pharmacy_m);
  if (competitors != null) {
    out.push({
      tone: competitors <= 2 ? "support" : competitors >= 6 ? "limit" : "neutral",
      text:
        `${competitors} competing ${competitors === 1 ? "pharmacy" : "pharmacies"} within 2 km` +
        (nearest != null ? ` · nearest ${Math.round(nearest)} m` : ""),
    });
  }

  const places =
    num(healthcare?.approved_places_2km) ??
    num(raw?.official_healthcare_anchor_context?.approved_places_2km);
  const agedCare = num(healthcare?.aged_care_2km);
  if (places != null && places > 0) {
    out.push({
      tone: "support",
      text: `${Math.round(places).toLocaleString("en-AU")} residential aged-care places within 2 km`,
    });
  } else if (agedCare != null && agedCare > 0) {
    out.push({
      tone: "support",
      text: `${agedCare} aged-care ${agedCare === 1 ? "facility" : "facilities"} within 2 km`,
    });
  }

  const seifa = num(demo?.seifa_irsd_state_percentile);
  if (seifa != null) {
    out.push({
      tone: "neutral",
      text:
        seifa < 20
          ? `SEIFA ${Math.round(seifa)}th percentile — high relative disadvantage`
          : seifa > 80
            ? `SEIFA ${Math.round(seifa)}th percentile — high relative advantage`
            : `SEIFA ${Math.round(seifa)}th percentile disadvantage index`,
    });
  }

  const growth = num(raw.population_growth_2023_2024_percent);
  if (growth != null) {
    out.push({
      tone: growth >= 1.5 ? "support" : growth < 0 ? "limit" : "neutral",
      text: `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% annual population growth`,
    });
  }

  return out;
}

const TONE_STYLE: Record<InsightTone, { dot: string; text: string }> = {
  support: { dot: "bg-teal", text: "text-foreground" },
  limit: { dot: "bg-amber", text: "text-foreground" },
  neutral: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

// ---------------------------------------------------------------------------
// The unified intelligence block: estimated-scripts hero, synthesized
// insights, an at-a-glance stat row, and the full evidence breakdown behind a
// disclosure. Reuses the same query keys as the previous separate sections, so
// React Query serves each dataset from a single shared fetch.
// ---------------------------------------------------------------------------
function PharmacyIntelligence({
  premisesId,
  lat,
  lng,
  authed,
}: {
  premisesId: string;
  lat: number;
  lng: number;
  authed: boolean;
}) {
  const potential = useQuery({
    queryKey: ["dispensing-potential", premisesId],
    queryFn: () => fetchDispensingPotential(premisesId),
  });
  const demographics = useQuery({
    queryKey: ["pharmacy-official-demographics", premisesId],
    queryFn: () => fetchPharmacyDemographics(premisesId),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const healthcare = useQuery({
    queryKey: ["pharmacy-healthcare-demand", lat, lng],
    queryFn: () => fetchHealthcareDemand(lat, lng),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const calibration = useQuery({
    queryKey: ["dispensing-calibration", premisesId],
    queryFn: () => fetchCalibrationSummary(premisesId),
    enabled: authed,
  });
  const comparison = useQuery({
    queryKey: ["dispensing-potential-model-comparison", premisesId],
    queryFn: () => fetchDispensingPotentialComparison(premisesId),
  });

  const p = potential.data as any;
  const demo = demographics.data as any;
  const hc = healthcare.data as any;
  const raw = p?.raw_metrics ?? {};
  const components = p?.component_scores ?? {};
  const central = num(p?.experimental_scripts_day_equivalent);
  const low = num(p?.theoretical_scripts_day_low);
  const high = num(p?.theoretical_scripts_day_high);
  const confidence = (p?.evidence_confidence as string | undefined) ?? null;
  const insights = useMemo(() => (p ? buildInsights(p, demo, hc) : []), [p, demo, hc]);

  const actual = calibration.data?.observations?.[0];
  const sample = calibration.data?.sampleSize ?? 0;
  const ratio = actual && central ? Number(actual.observed_scripts_per_day) / central : null;

  return (
    <section>
      {/* Estimated daily scripts hero */}
      <div className="rounded-xl border border-border bg-gradient-to-b from-muted/60 to-card p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Estimated daily scripts</SectionLabel>
          {confidence && <ConfidenceBadge confidence={confidence} />}
        </div>
        {potential.isLoading ? (
          <div className="mt-3 h-9 w-24 animate-pulse rounded bg-muted" />
        ) : central != null ? (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums tracking-tight">
                {Math.round(central).toLocaleString("en-AU")}
              </span>
              <span className="text-sm text-muted-foreground">scripts/day</span>
            </div>
            {low != null && high != null && (
              <div className="mt-1 text-xs text-muted-foreground">
                Modelled range{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(low).toLocaleString("en-AU")}–
                  {Math.round(high).toLocaleString("en-AU")}
                </span>{" "}
                per day
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium">{potentialBand(p.victorian_percentile)}</span>
              {p.victorian_percentile != null && (
                <span className="text-muted-foreground">
                  {Math.round(p.victorian_percentile)}th percentile statewide
                </span>
              )}
              {p.peer_percentile != null && (
                <span className="text-muted-foreground">
                  {Math.round(p.peer_percentile)}th among {p.peer_group}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">
            Not enough sourced evidence to estimate daily scripts here.
          </div>
        )}
        <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
          Geographic estimate from catchment population, nearby competition and local anchors.
          Experimental and not calibrated to actual dispensing — real volume varies with hours,
          service mix, institutional supply and operations.
        </p>
      </div>

      {/* Key insights */}
      {insights.length > 0 && (
        <div className="mt-4">
          <SectionLabel>Key insights</SectionLabel>
          <ul className="mt-2 space-y-1.5">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_STYLE[insight.tone].dot}`}
                  aria-hidden="true"
                />
                <span className={TONE_STYLE[insight.tone].text}>{insight.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* At a glance */}
      {p && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatTile label="Demand pressure" value={num(components.demand_pressure)} suffix="/100" />
          <StatTile
            label="Competition"
            value={num(components.competitive_position)}
            suffix="/100"
          />
          <StatTile
            label="Healthcare anchors"
            value={num(components.healthcare_anchors)}
            suffix="/100"
          />
          <StatTile label="Growth outlook" value={num(components.growth_outlook)} suffix="/100" />
        </div>
      )}

      {/* Full evidence breakdown */}
      {p && (
        <details className="group mt-4 rounded-lg border border-border">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium marker:content-none">
            <span className="text-muted-foreground group-open:hidden">
              Show full evidence breakdown ▸
            </span>
            <span className="hidden text-muted-foreground group-open:inline">
              Hide full evidence breakdown ▾
            </span>
          </summary>
          <div className="space-y-4 border-t border-border p-3 text-xs">
            <DemographicDetail demo={demo} loading={demographics.isLoading} />
            <HealthcareDetail hc={hc} loading={healthcare.isLoading} />
            <ModelDetail p={p} raw={raw} comparison={comparison.data} />
            {actual && (
              <div className="rounded border border-border p-2">
                <b>Actual vs. estimated</b>
                <div className="mt-1 text-muted-foreground">
                  Recorded {actual.observed_scripts_per_day}/day ·{" "}
                  {ratio == null
                    ? "ratio unavailable"
                    : ratio < 0.8
                      ? `${ratio.toFixed(2)}× — materially below estimate`
                      : ratio > 1.2
                        ? `${ratio.toFixed(2)}× — materially above estimate`
                        : `${ratio.toFixed(2)}× — broadly aligned`}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  A gap to the geographic estimate does not establish operational quality.
                </div>
              </div>
            )}
            <div className="text-muted-foreground">
              Calibration sample: {sample} verified {sample === 1 ? "observation" : "observations"}{" "}
              · {sample < 10 ? "relative screen only" : "below validation threshold"}
            </div>
          </div>
        </details>
      )}

      {authed && <CalibrationForm pharmacyId={premisesId} onSaved={() => calibration.refetch()} />}
    </section>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: "bg-teal/15 text-teal border-teal/30",
    medium: "border-border bg-muted text-muted-foreground",
    low: "bg-amber/15 text-amber border-amber/30",
  };
  const cls = styles[confidence] ?? styles.medium;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {confidence} confidence
    </span>
  );
}

function StatTile({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">
        {value == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {Math.round(value)}
            <span className="text-xs font-normal text-muted-foreground">{suffix}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DemographicDetail({ demo, loading }: { demo: any; loading: boolean }) {
  const display = (value: number | null | undefined, suffix = "") =>
    value == null ? "—" : `${Number(value).toLocaleString("en-AU")}${suffix}`;
  if (loading) return <div className="text-muted-foreground">Loading ABS area evidence…</div>;
  if (!demo || demo.coverage_status === "unavailable")
    return (
      <div>
        <b>Demographics</b>
        <div className="mt-1 text-muted-foreground">
          No official ABS coverage for this coordinate.
        </div>
      </div>
    );
  return (
    <div>
      <b>Demographics — {demo.sa2_name_2021 ?? "matched SA2"}</b>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-muted-foreground">
        <div>Population: {display(demo.census_total_population)}</div>
        <div>Age 65+: {display(demo.age_65_plus_percent, "%")}</div>
        <div>Age 75+: {display(demo.age_75_plus_percent, "%")}</div>
        <div>Under five: {display(demo.under_five_percent, "%")}</div>
        <div>Need assistance: {display(demo.need_assistance_percent, "%")}</div>
        <div>No vehicle: {display(demo.no_vehicle_dwellings_percent, "%")}</div>
        <div>SEIFA percentile: {display(demo.seifa_irsd_state_percentile)}</div>
        <div>Coverage: {demo.coverage_status}</div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        ABS 2021 SA2 average by point-in-polygon. Not a precise catchment; suppressed values stay
        unavailable, never zero.
      </p>
    </div>
  );
}

function HealthcareDetail({ hc, loading }: { hc: any; loading: boolean }) {
  if (loading) return <div className="text-muted-foreground">Loading healthcare evidence…</div>;
  if (!hc)
    return (
      <div>
        <b>Healthcare anchors</b>
        <div className="mt-1 text-muted-foreground">Healthcare evidence unavailable.</div>
      </div>
    );
  return (
    <div>
      <b>Healthcare-demand anchors</b>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-muted-foreground">
        <div>Aged care ≤ 1 km: {hc.aged_care_1km}</div>
        <div>Aged care ≤ 2 km: {hc.aged_care_2km}</div>
        <div>Places ≤ 2 km: {hc.approved_places_2km ?? "—"}</div>
        <div>Anchor index: {hc.weighted_healthcare_anchor_index}</div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Official aged-care places at 30 June 2025. Statewide hospital coverage is unavailable and is
        not treated as zero.
      </p>
    </div>
  );
}

function ModelDetail({ p, raw, comparison }: { p: any; raw: any; comparison: any }) {
  return (
    <div>
      <b>Model &amp; assumptions</b>
      <div className="mt-1 text-muted-foreground">
        {p.dispensing_potential_methods?.version ?? "model version unavailable"} · calculated{" "}
        {p.calculated_at ? new Date(p.calculated_at).toLocaleDateString() : "—"}
      </div>
      {(p.missing_inputs ?? []).length > 0 && (
        <div className="mt-1 text-muted-foreground">
          Missing inputs: {(p.missing_inputs ?? []).join(", ")}
        </div>
      )}
      {comparison && (
        <div className="mt-1.5 text-muted-foreground">
          {comparison.old_version} → {comparison.new_version}: score {comparison.old_score ?? "—"} →{" "}
          {comparison.new_score ?? "—"} ({comparison.score_change ?? "?"} change).{" "}
          {comparison.main_reason}
        </div>
      )}
      <details className="mt-1.5">
        <summary className="cursor-pointer text-muted-foreground">Raw metrics</summary>
        <pre className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </details>
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
    [sourceReference, setSourceReference] = useState(""),
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
        source: sourceReference,
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
          <input
            className="input col-span-2"
            placeholder="Source / provenance"
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
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

        // If the metadata row fails (RLS check, expired token, network) the
        // object is already stored. Without this compensation it becomes an
        // orphaned confidential document: invisible to the UI and to the audit
        // trail, but still readable by any organisation member.
        try {
          await registerImAttachment({
            premises_id: premisesId,
            storage_path: storagePath,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
          });
        } catch (registrationError) {
          await supabase.storage.from("information-memorandums").remove([storagePath]);
          throw registrationError;
        }
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
          IM_SIGNED_URL_TTL_SECONDS,
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
