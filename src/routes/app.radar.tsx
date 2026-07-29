/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getMyProfile, listMyOrgs } from "@/lib/orgs.functions";
import { getOpportunityRadar } from "@/lib/radar.functions";
import { addPharmacyToPipeline } from "@/lib/pharmacy-pipeline";

export const Route = createFileRoute("/app/radar")({
  head: () => ({
    meta: [{ title: "Opportunity Radar — Chemist Care" }, { name: "robots", content: "noindex" }],
  }),
  component: RadarPage,
});

const MODES = {
  highest_potential: "Highest Geographic Dispensing Potential",
  strongest_scripts_equivalent: "Strongest experimental scripts/day equivalents",
  high_growth_low_supply: "High growth with relatively weak pharmacy supply",
  healthcare_weak_supply: "Strong healthcare anchors with weak pharmacy supply",
  low_confidence_high_potential: "High potential with weak evidence",
  metropolitan: "Metropolitan opportunities",
  regional: "Regional opportunities",
  acquisition_below_potential: "Acquisitions below theoretical potential",
  ageing_population_demand: "Ageing-population demand context",
  aged_care_anchors: "Aged-care anchor opportunities",
  healthcare_demand: "Healthcare-demand opportunities",
  high_confidence_strong_potential: "Strong potential with high confidence",
  low_demographic_resolution: "Strong potential with low demographic resolution",
  largest_model_change: "Largest change from GDP v1.0 to v1.1",
} as const;

function RadarPage() {
  const radarFn = useServerFn(getOpportunityRadar);
  const profileFn = useServerFn(getMyProfile);
  const orgsFn = useServerFn(listMyOrgs);
  const radar = useQuery({ queryKey: ["opportunity-radar"], queryFn: () => radarFn() });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const [mode, setMode] = useState<keyof typeof MODES>("highest_potential");
  const [compare, setCompare] = useState<string[]>([]);
  const [entityCompare, setEntityCompare] = useState<string[]>([]);
  const orgName =
    (orgs.data ?? []).find((row) => row.id === profile.data?.current_organisation_id)?.name ?? null;
  type RadarRow = NonNullable<typeof radar.data>["rankings"][keyof typeof MODES][number];
  const rows: RadarRow[] = radar.data?.rankings[mode] ?? [];
  const compared = rows.filter(
    (row: RadarRow) => row.pharmacy_id && compare.includes(row.pharmacy_id),
  );
  async function add(pharmacyId: string) {
    try {
      const result = await addPharmacyToPipeline(pharmacyId);
      toast.success(result?.created ? "Added to private watchlist" : "Already in your pipeline");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add to pipeline");
    }
  }
  return (
    <AppShell currentOrgName={orgName}>
      <main className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-semibold">Opportunity Radar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explainable screening rankings from sourced, server-calculated evidence. Missing evidence
          remains visible and lowers confidence.
        </p>
        <MorningBrief brief={radar.data?.brief} />
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(MODES).map(([key, label]) => (
            <button
              key={key}
              className={mode === key ? "btn bg-primary text-primary-foreground" : "btn"}
              onClick={() => {
                setMode(key as keyof typeof MODES);
                setCompare([]);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Rank</th>
                <th>Pharmacy</th>
                <th>Score / range</th>
                <th>Evidence</th>
                <th>Why this ranks</th>
                <th>Limiting factor</th>
                <th>Supporting metrics</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: RadarRow, index: number) => (
                <tr key={row.pharmacy_id ?? `row-${index}`} className="border-t align-top">
                  <td className="p-3 font-semibold">#{index + 1}</td>
                  <td className="py-3 pr-3">
                    <b>{row.name ?? "Unknown pharmacy"}</b>
                    <div>{row.suburb ?? row.address ?? "Location unavailable"}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <b>{row.score ?? "Unknown"}</b>
                    <div>
                      {row.theoretical_low == null
                        ? "No theoretical range"
                        : `Experimental theoretical range ${row.theoretical_low}–${row.theoretical_high}/day`}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    {row.evidence_confidence}
                    <div>
                      {(row.missing_inputs ?? []).length
                        ? `${(row.missing_inputs ?? []).length} missing inputs`
                        : "No missing inputs recorded"}
                    </div>
                  </td>
                  <td className="py-3 pr-3">{row.principal_reason}</td>
                  <td className="py-3 pr-3">{row.limiting_factor}</td>
                  <td className="py-3 pr-3">
                    <div>
                      Nearest competitor:{" "}
                      {row.nearest_competitor_m == null
                        ? "Unknown"
                        : `${Math.round(row.nearest_competitor_m)} m`}
                    </div>
                    <div>Medical centres (1 km): {row.medical_centres_1km ?? "Unknown"}</div>
                    <div>
                      Population growth:{" "}
                      {row.population_growth == null
                        ? "Unknown"
                        : `${row.population_growth.toFixed(1)}%`}
                    </div>
                    <div>
                      Calculated:{" "}
                      {row.calculated_at
                        ? new Date(row.calculated_at).toLocaleDateString()
                        : "Unknown"}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <Link className="underline" to="/pharmacy/$id" params={{ id: row.pharmacy_id }}>
                      Open on map
                    </Link>
                    <button
                      className="ml-2 underline"
                      onClick={() =>
                        setCompare((current) =>
                          current.includes(row.pharmacy_id)
                            ? current.filter((id) => id !== row.pharmacy_id)
                            : current.length < 4
                              ? [...current, row.pharmacy_id]
                              : current,
                        )
                      }
                    >
                      Compare
                    </button>
                    <button className="ml-2 underline" onClick={() => add(row.pharmacy_id)}>
                      Add to pipeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {compared.length >= 2 && (
          <section className="mt-5 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Side-by-side comparison ({compared.length}/4)</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {compared.map((row: RadarRow) => (
                <div key={row.pharmacy_id} className="rounded border p-3">
                  <b>{row.name ?? "Unknown pharmacy"}</b>
                  <div>Score {row.score ?? "Unknown"}</div>
                  <div>Victorian percentile {row.victorian_percentile ?? "Unknown"}</div>
                  <div>Confidence {row.evidence_confidence}</div>
                  <div>{row.principal_reason}</div>
                  <div className="text-muted-foreground">{row.limiting_factor}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="mt-5 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Compare pharmacies, candidates and acquisitions</h2>
          <p className="text-xs text-muted-foreground">
            Select two to four. Private identifiers remain in local component state and are not
            written to the URL.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(radar.data?.comparison_pool ?? []).slice(0, 40).map((item) => (
              <button
                key={item.id}
                className={
                  entityCompare.includes(item.id) ? "btn bg-primary text-primary-foreground" : "btn"
                }
                onClick={() =>
                  setEntityCompare((current) =>
                    current.includes(item.id)
                      ? current.filter((id) => id !== item.id)
                      : current.length < 4
                        ? [...current, item.id]
                        : current,
                  )
                }
              >
                {item.type}: {item.name}
              </button>
            ))}
          </div>
          {entityCompare.length >= 2 && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(radar.data?.comparison_pool ?? [])
                .filter((item) => entityCompare.includes(item.id))
                .map((item) => (
                  <div key={item.id} className="rounded border p-3">
                    <div className="text-xs uppercase text-muted-foreground">{item.type}</div>
                    <b>{item.name}</b>
                    <div>Score: {item.score ?? "Not comparable / unavailable"}</div>
                    <div>Evidence: {item.confidence}</div>
                    <div>{item.summary}</div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

function MorningBrief({ brief }: { brief: any }) {
  if (!brief) return <div className="mt-5 rounded-xl border p-4">Loading morning brief…</div>;
  return (
    <section className="mt-5 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Morning brief</h2>
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
        <div>
          Saved opportunities: <b>{brief.saved_opportunities}</b>
        </div>
        <div>
          Saved candidates: <b>{brief.saved_candidates}</b>
        </div>
        <div>
          Candidate evidence changes: <b>{brief.changed_candidates}</b>
        </div>
        <div>
          Stale or undated sources: <b>{brief.stale_sources.length}</b>
        </div>
        <div>
          Strongest current screen:{" "}
          <b>{brief.strongest_opportunity?.name ?? "Insufficient evidence"}</b>
        </div>
        <div>
          Deployment commit: <code>{String(brief.deployment_commit).slice(0, 7)}</code>
        </div>
      </div>
      {brief.stale_sources.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Warning: {brief.stale_sources.map((source: any) => source.source_name).join(", ")} require
          freshness review.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        No change is asserted where no historical assessment baseline exists.
      </p>
    </section>
  );
}
