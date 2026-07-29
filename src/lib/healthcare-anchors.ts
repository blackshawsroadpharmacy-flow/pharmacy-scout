/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as client } from "@/integrations/supabase/client";
import type { ViewportBounds } from "@/lib/external-locations";
const supabase = client as any;

export interface HealthcareAnchor {
  id: string;
  category: string;
  name: string;
  provider: string | null;
  address: string | null;
  suburb: string | null;
  facility_type: string | null;
  approved_places: number | null;
  hospital_type: string | null;
  emergency_department: boolean | null;
  operational_status: string | null;
  lat: number;
  lng: number;
  evidence_confidence: string;
  source_date: string;
}

export interface HealthcareDemand {
  aged_care_500m: number;
  aged_care_1km: number;
  aged_care_2km: number;
  aged_care_5km: number;
  approved_places_500m: number | null;
  approved_places_1km: number | null;
  approved_places_2km: number | null;
  approved_places_5km: number | null;
  nearest_hospital_m: number | null;
  hospitals_5km: number;
  weighted_healthcare_anchor_index: number;
  source_coverage: Record<string, string>;
  warning: string;
}

export async function fetchHealthcareAnchors(viewport: ViewportBounds, signal?: AbortSignal) {
  const request = supabase.rpc("healthcare_anchors_in_viewport", {
    west: viewport.west,
    south: viewport.south,
    east: viewport.east,
    north: viewport.north,
    categories: ["residential_aged_care"],
  });
  if (signal) signal.addEventListener("abort", () => request.abortSignal(signal), { once: true });
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as HealthcareAnchor[];
}

export async function fetchHealthcareDemand(lat: number, lng: number) {
  const { data, error } = await supabase.rpc("healthcare_demand_at_point", {
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw new Error(error.message);
  return data as HealthcareDemand;
}
