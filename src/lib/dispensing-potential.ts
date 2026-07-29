/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as client } from "@/integrations/supabase/client";
import { getCurrentOrganisationId } from "@/lib/pharmacy-profiles.public";
const supabase = client as any;

export async function fetchDispensingPotential(pharmacyId: string) {
  const { data, error } = await supabase
    .from("pharmacy_dispensing_potential")
    .select("*, dispensing_potential_methods!inner(version,label,weights,active)")
    .eq("pharmacy_id", pharmacyId)
    .eq("dispensing_potential_methods.active", true)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
export interface MapDispensingPotential {
  pharmacy_id: string;
  victorian_percentile: number | null;
  evidence_confidence: string;
  experimental_scripts_day_equivalent: number | null;
  top_insight: string | null;
}
export async function fetchMapDispensingPotentials(pharmacyIds: string[]) {
  if (pharmacyIds.length === 0) return new Map<string, MapDispensingPotential>();
  const { data, error } = await supabase
    .from("pharmacy_dispensing_potential")
    .select(
      "pharmacy_id,victorian_percentile,evidence_confidence,experimental_scripts_day_equivalent,explanation,dispensing_potential_methods!inner(active)",
    )
    .in("pharmacy_id", pharmacyIds.slice(0, 500))
    .eq("dispensing_potential_methods.active", true);
  if (!error && data) {
    const active = data.filter((row: any) => row.dispensing_potential_methods?.active);
    return new Map(
      active.map((row: any) => [
        row.pharmacy_id,
        {
          pharmacy_id: row.pharmacy_id,
          victorian_percentile: row.victorian_percentile,
          evidence_confidence: row.evidence_confidence,
          experimental_scripts_day_equivalent: row.experimental_scripts_day_equivalent,
          top_insight:
            Array.isArray(row.explanation?.positive_factors) &&
            typeof row.explanation.positive_factors[0] === "string"
              ? row.explanation.positive_factors[0]
              : null,
        },
      ]),
    );
  }
  if (error) throw new Error(error.message);
  return new Map();
}
export async function fetchDispensingPotentialComparison(pharmacyId: string) {
  const { data, error } = await supabase
    .from("dispensing_potential_model_comparison")
    .select("*")
    .eq("pharmacy_id", pharmacyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
export async function fetchCalibrationSummary(pharmacyId: string) {
  const organisationId = await getCurrentOrganisationId();
  const { data, error, count } = await supabase
    .from("dispensing_calibration_observations")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisationId)
    .eq("pharmacy_id", pharmacyId)
    .order("evidence_period_end", { ascending: false });
  if (error) throw new Error(error.message);
  return { observations: data ?? [], sampleSize: count ?? 0 };
}
export async function saveCalibrationObservation(input: {
  pharmacy_id: string;
  observed_scripts_per_day: number;
  evidence_period_start: string;
  evidence_period_end: string;
  trading_days_per_week: number;
  includes_private_prescriptions: boolean | null;
  includes_under_copayment: boolean | null;
  includes_daa_volume: boolean | null;
  includes_institutional_supply: boolean | null;
  source_type: string;
  source: string;
  source_document_or_note: string | null;
  confidence: "low" | "medium" | "high";
}) {
  const organisationId = await getCurrentOrganisationId();
  const user = (await client.auth.getUser()).data.user;
  if (!user) throw new Error("Sign in to add genuine calibration evidence.");
  const { error } = await supabase.from("dispensing_calibration_observations").insert({
    ...input,
    organisation_id: organisationId,
    entered_by: user.id,
  });
  if (error) throw new Error(error.message);
}
export function potentialBand(percentile: number | null) {
  if (percentile == null) return "Not rated";
  if (percentile < 10) return "Very low";
  if (percentile < 30) return "Low";
  if (percentile < 55) return "Moderate";
  if (percentile < 75) return "Strong";
  if (percentile < 90) return "Very strong";
  return "Exceptional";
}
