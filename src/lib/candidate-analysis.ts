import { supabase } from "@/integrations/supabase/client";
import { ABS_POPULATION_SOURCE } from "@/lib/population-intelligence";

export const ASSESSMENT_LABELS = [
  "appears to satisfy",
  "does not appear to satisfy",
  "insufficient evidence",
  "professional measurement required",
  "source coverage incomplete",
] as const;

export type AssessmentLabel = (typeof ASSESSMENT_LABELS)[number];

export interface CandidatePoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface CandidatePharmacyEvidence {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  calculated_point_distance_m: number;
  distance_usable?: boolean;
  confirmation_basis?: string;
  coordinate_quality: string;
  verification_status: string;
  source_name: string | null;
  source_url: string | null;
  evidence_fetched_at: string | null;
  unresolved_duplicate_candidates?: number;
  warnings?: string[];
}

export interface CandidateExternalEvidence {
  id: string;
  category: "supermarkets" | "medical_centres";
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  calculated_point_distance_m: number;
  coordinate_confidence: number;
  coordinate_method: string;
  verification_status: string;
  source_name: string;
  source_url: string | null;
  evidence_fetched_at: string;
  unresolved_conflicts: number;
  warnings: string[];
}

export interface CandidateAnalysis {
  candidate: CandidatePoint;
  radius_m: number;
  generated_at: string;
  assessment_label: AssessmentLabel;
  nearest_confirmed_pharmacy: CandidatePharmacyEvidence | null;
  nearest_conservative_pharmacy: CandidatePharmacyEvidence | null;
  pharmacies_within_radius: CandidatePharmacyEvidence[];
  supermarkets_within_500m: CandidateExternalEvidence[];
  medical_centres_within_500m: CandidateExternalEvidence[];
  source_coverage: Record<string, string>;
  required_caveats: string[];
}

export interface PopulationContext {
  areaCode: string;
  areaName: string;
  population2024: number | null;
  density2024: number | null;
  annualGrowth2023To2024: number | null;
  sourceUrl: string;
  evidencePeriod: string;
}

export interface AddressSearchResult extends CandidatePoint {
  label: string;
  sourceUrl: string;
}

export function isVictorianCandidate(point: CandidatePoint) {
  return point.lng >= 140.96 && point.lng <= 149.98 && point.lat >= -39.2 && point.lat <= -33.98;
}

export async function fetchCandidateAnalysis(
  point: CandidatePoint,
  radiusM: number,
  signal?: AbortSignal,
): Promise<CandidateAnalysis> {
  if (!isVictorianCandidate(point)) {
    throw new Error("Candidate location is outside Victorian operating bounds");
  }
  const request = supabase.rpc("candidate_site_analysis", {
    p_lat: point.lat,
    p_lng: point.lng,
    p_radius_m: radiusM,
  } as never);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw new Error(error.message);
  const analysis = data as unknown as CandidateAnalysis;
  if (!ASSESSMENT_LABELS.includes(analysis.assessment_label)) {
    throw new Error("Candidate analysis returned an unsupported assessment label");
  }
  return analysis;
}

export async function fetchPopulationContext(
  point: CandidatePoint,
  signal?: AbortSignal,
): Promise<PopulationContext | null> {
  if (!isVictorianCandidate(point)) return null;
  const query = new URLSearchParams({
    where: "1=1",
    geometry: `${point.lng},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "sa2_code_2021,sa2_name_2021,pop_yr2,pop_dens_yr,chg_y_to_y",
    returnGeometry: "false",
    f: "json",
  });
  const response = await fetch(`${ABS_POPULATION_SOURCE}/query?${query}`, { signal });
  if (!response.ok) throw new Error(`ABS population context returned ${response.status}`);
  const body = (await response.json()) as {
    features?: Array<{
      attributes: {
        sa2_code_2021: string | number;
        sa2_name_2021: string;
        pop_yr2: number | null;
        pop_dens_yr: number | null;
        chg_y_to_y: number | null;
      };
    }>;
  };
  const attributes = body.features?.[0]?.attributes;
  if (!attributes) return null;
  return {
    areaCode: String(attributes.sa2_code_2021),
    areaName: attributes.sa2_name_2021,
    population2024: attributes.pop_yr2,
    density2024: attributes.pop_dens_yr,
    annualGrowth2023To2024: attributes.chg_y_to_y,
    sourceUrl: ABS_POPULATION_SOURCE,
    evidencePeriod: "ERP 2024; annual change 2023–24; ASGS Edition 3 SA2 2021",
  };
}

export async function searchVictorianAddress(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 3) return [];
  const params = new URLSearchParams({
    q: `${normalized}, Victoria, Australia`,
    format: "jsonv2",
    limit: "5",
    countrycodes: "au",
    viewbox: "140.96,-33.98,149.98,-39.2",
    bounded: "1",
    addressdetails: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Address search returned ${response.status}`);
  const rows = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    osm_type: string;
    osm_id: number;
  }>;
  return rows
    .map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lon),
      label: row.display_name,
      sourceUrl: `https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`,
    }))
    .filter(isVictorianCandidate);
}
