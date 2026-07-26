import { supabase } from "@/integrations/supabase/client";

export type ExternalCategory = "supermarkets" | "medical_centres";
export type ExternalVerificationStatus =
  "confirmed" | "probable" | "unverified" | "conflicting" | "stale" | "no_source_coverage";

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ExternalMapPoint {
  id: string;
  category: ExternalCategory;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  verification_status: ExternalVerificationStatus;
  coordinate_confidence: number;
  source_name: string;
  source_url: string | null;
  fetched_at: string;
}

export interface ExternalDossier extends ExternalMapPoint {
  trading_name?: string | null;
  brand?: string | null;
  opening_hours?: string | null;
  floor_area_sqm?: number | null;
  floor_area_source?: string | null;
  services?: string[] | null;
  known_practitioners?: unknown[] | null;
  practitioner_evidence_source?: string | null;
  coordinate_method: string;
  observed_at: string | null;
  updated_at: string;
  licence_name: string | null;
  attribution_text: string | null;
  geographic_coverage: string | null;
  conflicts: unknown[];
}

export async function fetchExternalViewport(
  category: ExternalCategory,
  bounds: ViewportBounds,
  signal?: AbortSignal,
): Promise<ExternalMapPoint[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const request = client.rpc("external_points_in_viewport", {
    p_category: category,
    p_west: bounds.west,
    p_south: bounds.south,
    p_east: bounds.east,
    p_north: bounds.north,
    p_limit: 2000,
  });
  const { data, error } = await Promise.race([
    request,
    new Promise<never>((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
        once: true,
      });
    }),
  ]);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExternalMapPoint[];
}

export async function fetchExternalDossier(
  category: ExternalCategory,
  id: string,
): Promise<ExternalDossier | null> {
  const { data, error } = await (
    supabase as never as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }
  ).rpc("external_entity_dossier", { p_category: category, p_id: id });
  if (error) throw new Error(error.message);
  return data as ExternalDossier | null;
}

export async function fetchCandidateExternalSummary(lat: number, lng: number) {
  const { data, error } = await (
    supabase as never as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }
  ).rpc("candidate_external_summary", { p_lat: lat, p_lng: lng });
  if (error) throw new Error(error.message);
  return data as {
    supermarkets_within_500m: number;
    medical_centres_within_500m: number;
    assessment: string;
    professional_measurement_required: boolean;
    source_coverage: string;
    unresolved_evidence: string[];
  };
}
