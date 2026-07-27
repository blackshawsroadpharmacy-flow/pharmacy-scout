import { supabase } from "@/integrations/supabase/client";
import type { ViewportBounds } from "@/lib/external-locations";
import { ViewportRequestCoordinator, viewportRequestKey } from "@/lib/viewport-query.mjs";

export type VerificationStatus = "unverified" | "matched" | "verified" | "conflict";

export interface PremisesMapPoint {
  id: string;
  name: string;
  address: string;
  suburb: string | null;
  postcode: string | null;
  locality_name: string | null;
  lat: number;
  lng: number;
  vpa_registration_status: VerificationStatus;
  premises_source: string;
  source_confidence: string | null;
  geocode_method: string | null;
}

export interface PremisesDossier extends PremisesMapPoint {
  source_id: string | null;
  door_lat: number | null;
  door_lng: number | null;
  phone: string | null;
  website: string | null;
  source_name: string | null;
  source_url: string | null;
  source_fetched_at: string | null;
  pbs_approvals: Array<{ approval_number: string; approval_status: string }>;
}

export interface PharmacyViewportFilters {
  missingData: boolean;
  metroOnly: boolean;
}

export interface ViewportMetrics {
  durationMs: number;
  payloadBytes: number;
}

export interface PharmacyViewportResult {
  items: PremisesMapPoint[];
  totalCount: number;
  truncated: boolean;
  coverageState: "covered";
  coverageNote: string;
  requestKey: string;
  metrics: ViewportMetrics;
}

type PharmacyViewportRow = PremisesMapPoint & { total_count: number | string };
const pharmacyCoordinator = new ViewportRequestCoordinator<PharmacyViewportResult>();
// Keep low-zoom views bounded; total_count tells the UI when the visible
// viewport contains more records than can be transferred safely at once.
const VIEWPORT_LIMIT = 500;

export async function fetchPharmacyViewport(
  bounds: ViewportBounds,
  filters: PharmacyViewportFilters,
  externalSignal?: AbortSignal,
): Promise<PharmacyViewportResult> {
  const requestKey = viewportRequestKey("pharmacies", bounds, filters);
  if (!requestKey) throw new Error("Invalid Victorian viewport");

  return pharmacyCoordinator.request(
    requestKey,
    async (signal) => {
      const startedAt = performance.now();
      const { data, error } = await supabase
        .rpc("pharmacy_points_in_viewport", {
          p_west: bounds.west,
          p_south: bounds.south,
          p_east: bounds.east,
          p_north: bounds.north,
          p_missing_data: filters.missingData,
          p_metro_only: filters.metroOnly,
          p_limit: VIEWPORT_LIMIT,
        } as never)
        .abortSignal(signal);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as PharmacyViewportRow[];
      const totalCount = Number(rows[0]?.total_count ?? 0);
      const items = rows.map(({ total_count: _totalCount, ...point }) => point);
      return {
        items,
        totalCount,
        truncated: totalCount > items.length,
        coverageState: "covered",
        coverageNote:
          "Victorian pharmacy discovery dataset. Regulatory verification remains unavailable.",
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

export async function fetchDossier(
  id: string,
  signal?: AbortSignal,
): Promise<PremisesDossier | null> {
  const premisesRequest = supabase
    .from("pharmacy_premises_geo")
    .select(
      "id, name, address, suburb, postcode, locality_name, lat, lng, vpa_registration_status, premises_source, source_confidence, source_id, geocode_method, door_lat, door_lng, phone, website",
    )
    .eq("id", id)
    .maybeSingle();
  const approvalsRequest = supabase
    .from("pbs_approvals")
    .select("approval_number, approval_status")
    .eq("premises_id", id);

  const [premisesRes, approvalsRes] = await Promise.all([
    signal ? premisesRequest.abortSignal(signal) : premisesRequest,
    signal ? approvalsRequest.abortSignal(signal) : approvalsRequest,
  ]);
  if (premisesRes.error) throw new Error(premisesRes.error.message);
  if (approvalsRes.error) throw new Error(approvalsRes.error.message);
  if (!premisesRes.data) return null;

  const premises = premisesRes.data;
  const sourceRequest = premises.source_id
    ? supabase
        .from("source_records")
        .select("source_name, source_url, fetched_at")
        .eq("id", premises.source_id)
        .maybeSingle()
    : null;
  const sourceRes = sourceRequest
    ? await (signal ? sourceRequest.abortSignal(signal) : sourceRequest)
    : { data: null, error: null };
  if (sourceRes.error) throw new Error(sourceRes.error.message);

  return {
    ...(premises as unknown as PremisesMapPoint),
    source_id: premises.source_id,
    door_lat: premises.door_lat,
    door_lng: premises.door_lng,
    phone: premises.phone,
    website: premises.website,
    source_name: sourceRes.data?.source_name ?? null,
    source_url: sourceRes.data?.source_url ?? null,
    source_fetched_at: sourceRes.data?.fetched_at ?? null,
    pbs_approvals: (approvalsRes.data ?? []) as PremisesDossier["pbs_approvals"],
  };
}
