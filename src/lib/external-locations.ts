import { supabase } from "@/integrations/supabase/client";
import { ViewportRequestCoordinator, viewportRequestKey } from "@/lib/viewport-query.mjs";
import type { ViewportMetrics } from "@/lib/premises-public";

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

export interface ExternalViewportResult {
  items: ExternalMapPoint[];
  totalCount: number;
  truncated: boolean;
  coverageState: "partial";
  coverageNote: string;
  requestKey: string;
  metrics: ViewportMetrics;
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
  externalSignal?: AbortSignal,
): Promise<ExternalViewportResult> {
  const requestKey = viewportRequestKey(category, bounds);
  if (!requestKey) throw new Error("Invalid Victorian viewport");
  const coordinator = externalCoordinators[category];
  return coordinator.request(
    requestKey,
    async (signal) => {
      const startedAt = performance.now();
      const { data, error } = await supabase
        .rpc("external_points_in_viewport_v2", {
          p_category: category,
          p_west: bounds.west,
          p_south: bounds.south,
          p_east: bounds.east,
          p_north: bounds.north,
          p_limit: 2000,
        } as never)
        .abortSignal(signal);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<ExternalMapPoint & { total_count: number }>;
      const totalCount = Number(rows[0]?.total_count ?? 0);
      const items = rows.map(({ total_count: _totalCount, ...point }) => point);
      return {
        items,
        totalCount,
        truncated: totalCount > items.length,
        coverageState: "partial",
        coverageNote: "OpenStreetMap community coverage varies; no record is not evidence of none.",
        requestKey,
        metrics: {
          durationMs: performance.now() - startedAt,
          payloadBytes: new Blob([JSON.stringify(rows)]).size,
        },
      };
    },
    externalSignal,
  );
}

const externalCoordinators: Record<
  ExternalCategory,
  ViewportRequestCoordinator<ExternalViewportResult>
> = {
  supermarkets: new ViewportRequestCoordinator<ExternalViewportResult>(),
  medical_centres: new ViewportRequestCoordinator<ExternalViewportResult>(),
};

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
