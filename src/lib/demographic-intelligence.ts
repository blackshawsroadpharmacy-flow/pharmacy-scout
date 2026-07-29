/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as client } from "@/integrations/supabase/client";
import type { ViewportBounds } from "@/lib/external-locations";
const supabase = client as any;

export type DemographicMetric = "age65" | "age75" | "assistance" | "disadvantage" | "no_vehicle";

export interface DemographicContext {
  sa2_code_2021?: string;
  sa2_name_2021?: string;
  reference_year?: number;
  coverage_status: "complete" | "partial" | "unavailable";
  census_total_population?: number | null;
  age_65_plus_count?: number | null;
  age_65_plus_percent?: number | null;
  age_75_plus_count?: number | null;
  age_75_plus_percent?: number | null;
  under_five_count?: number | null;
  under_five_percent?: number | null;
  need_assistance_count?: number | null;
  need_assistance_percent?: number | null;
  no_vehicle_dwellings_count?: number | null;
  no_vehicle_dwellings_percent?: number | null;
  seifa_irsd_score?: number | null;
  seifa_irsd_state_decile?: number | null;
  seifa_irsd_state_percentile?: number | null;
  seifa_ier_score?: number | null;
  seifa_ier_state_decile?: number | null;
  missing_reasons?: string[];
  assignment_method?: string;
  coverage_percentage?: number;
  geographic_resolution?: string;
  census_measure?: string;
  source?: string;
  licence?: string;
  warning?: string;
}

export interface DemographicFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: {
      sa2_code_2021: string;
      sa2_name_2021: string;
      value: number | null;
      coverage_status: string;
      reference_year: number;
    };
  }>;
}

export async function fetchPharmacyDemographics(pharmacyId: string) {
  const { data, error } = await supabase
    .from("pharmacy_demographic_context")
    .select("*")
    .eq("pharmacy_id", pharmacyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? ({
        ...data.context,
        sa2_code_2021: data.sa2_code_2021,
        reference_year: data.reference_year,
        coverage_status: data.coverage_quality,
        assignment_method: data.assignment_method,
        geographic_resolution: data.geographic_resolution,
      } as DemographicContext)
    : ({ coverage_status: "unavailable", warning: "No source coverage" } as DemographicContext);
}

export async function fetchDemographicsAtPoint(lat: number, lng: number) {
  const { data, error } = await supabase.rpc("demographic_context_at_point", {
    candidate_lat: lat,
    candidate_lng: lng,
  });
  if (error) throw new Error(error.message);
  return data as DemographicContext;
}

export async function fetchDemographicViewport(
  viewport: ViewportBounds,
  metric: DemographicMetric,
  signal?: AbortSignal,
): Promise<DemographicFeatureCollection> {
  const request = supabase.rpc("demographic_areas_in_viewport", {
    west: viewport.west,
    south: viewport.south,
    east: viewport.east,
    north: viewport.north,
    metric,
  });
  if (signal) signal.addEventListener("abort", () => request.abortSignal(signal), { once: true });
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return {
    type: "FeatureCollection",
    features: (data ?? []).map((row: any) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: {
        sa2_code_2021: row.sa2_code_2021,
        sa2_name_2021: row.sa2_name_2021,
        value: row.value == null ? null : Number(row.value),
        coverage_status: row.coverage_status,
        reference_year: row.reference_year,
      },
    })),
  };
}

export function demographicColour(metric: DemographicMetric, value: number | null) {
  if (value == null || !Number.isFinite(value)) return "#d1d5db";
  const palettes: Record<DemographicMetric, Array<[number, string]>> = {
    age65: [
      [12, "#eff6ff"],
      [18, "#bfdbfe"],
      [24, "#60a5fa"],
      [32, "#2563eb"],
    ],
    age75: [
      [6, "#f5f3ff"],
      [10, "#ddd6fe"],
      [15, "#a78bfa"],
      [22, "#7c3aed"],
    ],
    assistance: [
      [4, "#ecfdf5"],
      [7, "#a7f3d0"],
      [10, "#34d399"],
      [15, "#047857"],
    ],
    disadvantage: [
      [20, "#7f1d1d"],
      [40, "#ef4444"],
      [60, "#fde68a"],
      [80, "#86efac"],
    ],
    no_vehicle: [
      [4, "#fff7ed"],
      [8, "#fed7aa"],
      [15, "#fb923c"],
      [25, "#c2410c"],
    ],
  };
  return palettes[metric].find(([limit]) => value < limit)?.[1] ?? palettes[metric].at(-1)![1];
}

export const DEMOGRAPHIC_LABELS: Record<DemographicMetric, string> = {
  age65: "Residents aged 65+",
  age75: "Residents aged 75+",
  assistance: "Core activity need for assistance",
  disadvantage: "SEIFA disadvantage percentile",
  no_vehicle: "Dwellings with no motor vehicle",
};
