import { Printer, X } from "lucide-react";
import type {
  CandidateAnalysis,
  CandidatePoint,
  PopulationContext,
} from "@/lib/candidate-analysis";

const RADII = [300, 500, 1000, 1500, 2000, 5000];

function metres(value: number | null | undefined) {
  return value == null ? "Unknown" : `${Math.round(value).toLocaleString()} m`;
}

function evidenceDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-AU") : "Date unavailable";
}

export function CandidateAnalysisPanel({
  point,
  radiusM,
  onRadius,
  analysis,
  population,
  loading,
  error,
  onClose,
}: {
  point: CandidatePoint;
  radiusM: number;
  onRadius: (radius: number) => void;
  analysis: CandidateAnalysis | null;
  population: PopulationContext | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const conservative = analysis?.nearest_conservative_pharmacy;
  const confirmed = analysis?.nearest_confirmed_pharmacy;
  return (
    <aside
      id="candidate-assessment"
      className="candidate-assessment pointer-events-auto absolute bottom-7 right-3 top-16 z-[1080] flex w-[min(430px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
    >
      <header className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Preliminary candidate-site assessment</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {point.label ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded p-1.5 hover:bg-accent"
            aria-label="Print preliminary assessment"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 hover:bg-accent"
            aria-label="Close candidate assessment"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="overflow-y-auto p-4 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span className="font-medium">Pharmacy search radius</span>
          <select
            value={radiusM}
            onChange={(event) => onRadius(Number(event.target.value))}
            className="rounded border border-border bg-background px-2 py-1"
          >
            {RADII.map((radius) => (
              <option key={radius} value={radius}>
                {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
              </option>
            ))}
          </select>
        </label>

        {loading && <p className="mt-4 text-muted-foreground">Calculating sourced evidence…</p>}
        {error && (
          <p className="mt-4 rounded border border-destructive/40 p-2 text-destructive">{error}</p>
        )}

        {analysis && (
          <>
            <div className="mt-4 rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Preliminary interpretation
              </div>
              <div className="mt-1 text-base font-semibold">{analysis.assessment_label}</div>
              <p className="mt-1 text-muted-foreground">
                Not legal advice or a final Pharmacy Location Rule determination.
              </p>
            </div>

            <section className="mt-4">
              <h3 className="font-semibold">Calculated distance</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <EvidenceCard
                  title="Nearest confirmed pharmacy"
                  name={confirmed?.name ?? "No confirmed coverage"}
                  detail={metres(confirmed?.calculated_point_distance_m)}
                  note={confirmed?.confirmation_basis ?? analysis.source_coverage.pharmacies}
                />
                <EvidenceCard
                  title="Conservative nearest record"
                  name={conservative?.name ?? "No discovery record"}
                  detail={metres(conservative?.calculated_point_distance_m)}
                  note={
                    conservative?.distance_usable
                      ? "Sourced point; professional verification still required"
                      : "Approximate/conflicting coordinate; distance is not usable as a rule measurement"
                  }
                />
              </div>
              {conservative?.warnings?.map((warning) => (
                <p key={warning} className="mt-1 text-[11px] text-amber-700">
                  {warning}
                </p>
              ))}
            </section>

            <section className="mt-4">
              <h3 className="font-semibold">Nearby sourced records</h3>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <CountCard
                  label={`Pharmacies ≤ ${radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`}`}
                  count={analysis.pharmacies_within_radius.length}
                />
                <CountCard
                  label="Supermarkets ≤ 500 m"
                  count={analysis.supermarkets_within_500m.length}
                />
                <CountCard
                  label="Medical centres ≤ 500 m"
                  count={analysis.medical_centres_within_500m.length}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Counts are discovery evidence. Floor area, practitioner FTE and PBS prescriber
                counts are not inferred.
              </p>
            </section>

            <section className="mt-4">
              <h3 className="font-semibold">Population context</h3>
              {population ? (
                <div className="mt-2 rounded border border-border p-2">
                  <div className="font-medium">{population.areaName}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <div>
                      Density:{" "}
                      {population.density2024 == null
                        ? "No source coverage"
                        : `${population.density2024.toLocaleString()} people/km²`}
                    </div>
                    <div>
                      Growth:{" "}
                      {population.annualGrowth2023To2024 == null
                        ? "No source coverage"
                        : `${population.annualGrowth2023To2024.toFixed(1)}%`}
                    </div>
                  </div>
                  <a
                    href={population.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-teal underline"
                  >
                    ABS · {population.evidencePeriod}
                  </a>
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">No source coverage</p>
              )}
            </section>

            <section className="mt-4">
              <h3 className="font-semibold">Source coverage and warnings</h3>
              <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                {Object.entries(analysis.source_coverage).map(([source, coverage]) => (
                  <li key={source}>
                    <span className="font-medium text-foreground">{source}:</span> {coverage}
                  </li>
                ))}
              </ul>
              {(conservative?.unresolved_duplicate_candidates ?? 0) > 0 && (
                <p className="mt-2 text-amber-700">
                  {conservative?.unresolved_duplicate_candidates} unresolved duplicate candidate(s)
                  near the conservative pharmacy record.
                </p>
              )}
            </section>

            <section className="mt-4 border-t border-border pt-3">
              <h3 className="font-semibold">Evidence links and dates</h3>
              <EvidenceLink
                label={conservative?.source_name ?? "Pharmacy source"}
                url={conservative?.source_url}
                date={conservative?.evidence_fetched_at}
              />
              {[...analysis.supermarkets_within_500m, ...analysis.medical_centres_within_500m].map(
                (item) => (
                  <EvidenceLink
                    key={`${item.category}:${item.id}`}
                    label={item.name}
                    url={item.source_url}
                    date={item.evidence_fetched_at}
                  />
                ),
              )}
            </section>

            <ul className="mt-4 list-disc space-y-1 pl-4 text-[10px] text-muted-foreground">
              {analysis.required_caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

function EvidenceCard({
  title,
  name,
  detail,
  note,
}: {
  title: string;
  name: string;
  detail: string;
  note: string;
}) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-[10px] text-muted-foreground">{title}</div>
      <div className="mt-1 font-medium">{name}</div>
      <div className="text-lg font-semibold">{detail}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>
    </div>
  );
}

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-lg font-semibold">{count}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EvidenceLink({
  label,
  url,
  date,
}: {
  label: string;
  url: string | null | undefined;
  date: string | null | undefined;
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="truncate text-teal underline">
          {label}
        </a>
      ) : (
        <span className="truncate">{label}</span>
      )}
      <span className="shrink-0 text-muted-foreground">{evidenceDate(date)}</span>
    </div>
  );
}
