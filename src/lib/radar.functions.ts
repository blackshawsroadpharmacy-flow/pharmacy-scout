/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function currentOrganisation(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .single();
  if (error || !data?.current_organisation_id) throw new Error("No organisation selected.");
  return data.current_organisation_id as string;
}

function number(metric: any, key: string) {
  const value = metric?.[key];
  return value == null ? null : Number(value);
}

// Every ranking is rendered by the same table, which reads these fields
// unguarded. Any row reaching the UI must carry all of them.
function placeholderRow(pharmacyId: string) {
  return {
    pharmacy_id: pharmacyId,
    name: "Pharmacy outside the current ranking pool",
    suburb: null,
    address: null,
    lat: null,
    lng: null,
    score: null,
    victorian_percentile: null,
    peer_group: null,
    peer_percentile: null,
    theoretical_low: null,
    theoretical_high: null,
    experimental_scripts_day: null,
    evidence_confidence: "unknown",
    principal_reason: "Model assumptions changed",
    limiting_factor: "Detail unavailable for this pharmacy",
    nearest_competitor_m: null,
    medical_centres_1km: null,
    population_growth: null,
    source_reference_period: null,
    calculated_at: null,
    model_version: null,
    demand_pressure: null,
    competition: null,
    healthcare: null,
    missing_inputs: [] as string[],
    raw_metrics: {},
  };
}

// Map an annual population-growth percentage onto 0-100 so it can be weighted
// against the other 0-100 component scores. -2% or lower -> 0, +6% or higher -> 100.
function normaliseGrowth(growthPercent: number | null | undefined) {
  if (growthPercent == null || !Number.isFinite(growthPercent)) return 0;
  return Math.max(0, Math.min(100, ((growthPercent + 2) / 8) * 100));
}

export const getOpportunityRadar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const organisationId = await currentOrganisation(supabase, context.userId);
    const [
      potential,
      opportunities,
      businesses,
      calibration,
      greenfield,
      relocation,
      sources,
      freshness,
      comparisons,
    ] = await Promise.all([
      supabase
        .from("pharmacy_dispensing_potential")
        .select(
          "*, pharmacy_premises!inner(id,name,address,suburb,lat,lng), dispensing_potential_methods!inner(version,active)",
        )
        // Every ranking below re-sorts this pool, so it must cover the whole
        // active-method population. Pre-limiting by percentile made each lens
        // implicitly "…among the top overall performers".
        .order("victorian_percentile", { ascending: false })
        .eq("dispensing_potential_methods.active", true)
        .limit(2000),
      supabase
        .from("opportunities")
        .select("id,title,pipeline_stage,business_id,updated_at")
        .eq("organisation_id", organisationId)
        .eq("type", "acquisition"),
      supabase
        .from("pharmacy_businesses")
        .select("id,trading_name,premises_id,opportunity_status")
        .eq("organisation_id", organisationId),
      supabase
        .from("dispensing_calibration_observations")
        .select("pharmacy_id,observed_scripts_per_day,evidence_period_end")
        .eq("organisation_id", organisationId)
        .order("evidence_period_end", { ascending: false }),
      supabase
        .from("greenfield_scenarios")
        .select("id,name,updated_at,archived_at,greenfield_assessments(version,change_summary)")
        .eq("organisation_id", organisationId),
      supabase
        .from("relocation_scenarios")
        .select("id,name,updated_at,archived_at,relocation_assessments(version,change_summary)")
        .eq("organisation_id", organisationId)
        .eq("orphaned_demo", false),
      supabase
        .from("source_records")
        .select("source_name,fetched_at,coverage_description,confidence")
        .order("source_name"),
      supabase.rpc("public_data_freshness"),
      supabase
        .from("dispensing_potential_model_comparison")
        .select(
          "pharmacy_id,score_change,main_reason,old_version,new_version,old_score,new_score,old_confidence,new_confidence",
        )
        .order("pharmacy_id")
        .limit(2000),
    ]);
    for (const result of [
      potential,
      opportunities,
      businesses,
      calibration,
      greenfield,
      relocation,
      sources,
      freshness,
      comparisons,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }
    const rows = (potential.data ?? []).map((row: any) => {
      const raw = row.raw_metrics ?? {};
      const demographics = raw.official_demographic_context ?? {};
      const components = row.component_scores ?? {};
      const pharmacy = row.pharmacy_premises;
      const reasons = [
        number(components, "demand_pressure") != null
          ? `Demand pressure ${number(components, "demand_pressure")?.toFixed(0)}/100`
          : null,
        number(components, "healthcare_anchors") != null
          ? `${number(raw, "medical_centres_1km")} sourced medical centres within 1 km`
          : null,
        number(raw, "population_growth_2023_2024_percent") != null
          ? `${number(raw, "population_growth_2023_2024_percent")?.toFixed(1)}% sourced population growth`
          : null,
        number(demographics, "age_65_plus_percent") != null
          ? `${number(demographics, "age_65_plus_percent")?.toFixed(1)}% aged 65+ in the matched ABS 2021 SA2`
          : null,
        number(demographics, "need_assistance_percent") != null
          ? `${number(demographics, "need_assistance_percent")?.toFixed(1)}% report a core activity need for assistance in the matched SA2`
          : null,
      ].filter(Boolean);
      const limits = [
        ...(row.missing_inputs ?? []),
        number(raw, "pharmacies_2km") == null
          ? "Nearby pharmacy coverage unavailable"
          : `${number(raw, "pharmacies_2km")} competing pharmacies within 2 km`,
        demographics.coverage_status === "partial" || demographics.coverage_status === "unavailable"
          ? "Official ABS demographic coverage is incomplete; missing values are not zero"
          : null,
      ].filter(Boolean);
      return {
        pharmacy_id: pharmacy.id,
        name: pharmacy.name,
        suburb: pharmacy.suburb,
        address: pharmacy.address,
        lat: pharmacy.lat,
        lng: pharmacy.lng,
        score: row.relative_score,
        victorian_percentile: row.victorian_percentile,
        peer_group: row.peer_group,
        peer_percentile: row.peer_percentile,
        theoretical_low: row.theoretical_scripts_day_low,
        theoretical_high: row.theoretical_scripts_day_high,
        experimental_scripts_day: row.experimental_scripts_day_equivalent,
        evidence_confidence: row.evidence_confidence,
        principal_reason: reasons[0] ?? "Relative score from available sourced evidence",
        limiting_factor: limits[0] ?? "No material limitation recorded",
        nearest_competitor_m: number(raw, "nearest_competing_pharmacy_m"),
        medical_centres_1km: number(raw, "medical_centres_1km"),
        population_growth: number(raw, "population_growth_2023_2024_percent"),
        source_reference_period: raw.demographic_reference_period ?? null,
        calculated_at: row.calculated_at,
        model_version: row.dispensing_potential_methods?.version ?? null,
        demand_pressure: number(components, "demand_pressure"),
        competition: number(components, "competitive_position"),
        healthcare: number(components, "healthcare_anchors"),
        missing_inputs: row.missing_inputs ?? [],
        raw_metrics: raw,
      };
    });
    const sort = (score: (row: any) => number) =>
      [...rows].sort((a, b) => score(b) - score(a)).slice(0, 20);
    const scenarioRows = [...(greenfield.data ?? []), ...(relocation.data ?? [])];
    const actualByPharmacy = new Map<string, number>();
    for (const observation of calibration.data ?? []) {
      if (!actualByPharmacy.has(observation.pharmacy_id)) {
        actualByPharmacy.set(observation.pharmacy_id, Number(observation.observed_scripts_per_day));
      }
    }
    const opportunityBusinessIds = new Set(
      (opportunities.data ?? []).map((opportunity: any) => opportunity.business_id),
    );
    const acquisitionRows = rows
      .filter((row: any) =>
        (businesses.data ?? []).some(
          (business: any) =>
            opportunityBusinessIds.has(business.id) && business.premises_id === row.pharmacy_id,
        ),
      )
      // Benchmark against the central estimate, not the widened upper bound —
      // dividing by theoretical_high flagged almost every real pharmacy as
      // underperforming. Low-confidence rows are excluded entirely.
      .map((row: any) => ({
        ...row,
        actual_scripts_per_day: actualByPharmacy.get(row.pharmacy_id) ?? null,
        actual_to_theoretical:
          actualByPharmacy.has(row.pharmacy_id) && Number(row.experimental_scripts_day) > 0
            ? actualByPharmacy.get(row.pharmacy_id)! / Number(row.experimental_scripts_day)
            : null,
      }))
      .filter(
        (row: any) =>
          row.evidence_confidence !== "low" &&
          row.actual_to_theoretical != null &&
          row.actual_to_theoretical < 0.8,
      );
    const changedScenarios = scenarioRows.filter((scenario: any) =>
      (scenario.greenfield_assessments ?? scenario.relocation_assessments ?? []).some(
        (assessment: any) =>
          assessment.version > 1 &&
          assessment.change_summary &&
          assessment.change_summary.initial_assessment === false,
      ),
    );
    const now = Date.now();
    const staleSources = (sources.data ?? []).filter(
      (source: any) =>
        !source.fetched_at || now - new Date(source.fetched_at).getTime() > 180 * 86400000,
    );
    return {
      rankings: {
        highest_potential: rows.slice(0, 20),
        // Rank on the central estimate. theoretical_high is widened by a
        // confidence multiplier (x1.35 high -> x1.75 low), so ranking on it
        // promoted the least-evidenced pharmacies.
        strongest_scripts_equivalent: [...rows]
          .sort(
            (a: any, b: any) =>
              Number(b.experimental_scripts_day ?? -1) - Number(a.experimental_scripts_day ?? -1),
          )
          .slice(0, 20),
        // Both inputs are normalised to 0-100 before weighting; previously a
        // raw growth percentage was scaled by 10 and swamped by competition.
        high_growth_low_supply: sort(
          (row) => normaliseGrowth(row.population_growth) * 0.6 + (row.competition ?? 0) * 0.4,
        ),
        healthcare_weak_supply: sort((row) => (row.healthcare ?? 0) + (row.competition ?? 0)),
        low_confidence_high_potential: rows
          .filter((row: any) => row.evidence_confidence !== "high")
          .slice(0, 20),
        metropolitan: rows.filter((row: any) => row.peer_group === "metropolitan").slice(0, 20),
        regional: rows.filter((row: any) => row.peer_group === "regional").slice(0, 20),
        acquisition_below_potential: acquisitionRows,
        ageing_population_demand: sort(
          (row) =>
            number(row.raw_metrics?.official_demographic_context, "age_65_plus_percent") ?? -1,
        ),
        aged_care_anchors: sort(
          (row) =>
            number(row.raw_metrics?.official_healthcare_anchor_context, "approved_places_2km") ??
            -1,
        ),
        healthcare_demand: sort((row) => row.healthcare ?? -1),
        high_confidence_strong_potential: rows
          .filter((row: any) => row.evidence_confidence === "high")
          .slice(0, 20),
        low_demographic_resolution: rows
          .filter(
            (row: any) =>
              number(row.raw_metrics, "demographic_coverage_percentage") != null &&
              number(row.raw_metrics, "demographic_coverage_percentage")! < 100,
          )
          .slice(0, 20),
        // A pharmacy with a large model change need not also rank highly on
        // potential, so it may be absent from `rows`. Fall back to a fully
        // populated placeholder rather than spreading `{}` — the renderer
        // reads row.missing_inputs.length and row.calculated_at unguarded.
        largest_model_change: [...(comparisons.data ?? [])]
          .sort(
            (a: any, b: any) =>
              Math.abs(Number(b.score_change ?? 0)) - Math.abs(Number(a.score_change ?? 0)),
          )
          .slice(0, 20)
          .map((change: any) => {
            const known = rows.find((row: any) => row.pharmacy_id === change.pharmacy_id);
            return {
              ...(known ?? placeholderRow(change.pharmacy_id)),
              score_change: change.score_change,
              principal_reason: change.main_reason ?? "Model assumptions changed",
            };
          }),
      },
      comparison_pool: [
        ...rows.slice(0, 20).map((row: any) => ({
          id: `pharmacy:${row.pharmacy_id}`,
          type: "pharmacy",
          name: row.name,
          score: row.score,
          confidence: row.evidence_confidence,
          summary: row.principal_reason,
        })),
        ...(opportunities.data ?? []).map((row: any) => ({
          id: `acquisition:${row.id}`,
          type: "acquisition",
          name: row.title,
          score: null,
          confidence: "private commercial evidence",
          summary: `Pipeline stage: ${row.pipeline_stage}`,
        })),
        ...scenarioRows.map((row: any) => ({
          id: `candidate:${row.id}`,
          type: "candidate",
          name: row.name,
          score: null,
          confidence: "assessment evidence",
          summary: row.archived_at ? "Archived; recoverable" : "Active saved scenario",
        })),
      ],
      brief: {
        source_freshness: freshness.data,
        stale_sources: staleSources,
        saved_opportunities: (opportunities.data ?? []).length,
        saved_candidates: scenarioRows.filter((row: any) => !row.archived_at).length,
        changed_candidates: changedScenarios.length,
        strongest_opportunity: rows[0] ?? null,
        deployment_commit: import.meta.env.VITE_BUILD_COMMIT_SHA,
      },
    };
  });
