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
  vpa_official_name: string | null;
  vpa_official_full_address: string | null;
  vpa_registration_status_raw: string | null;
  vpa_registration_status_normalised: string;
  vpa_registered_until: string | null;
  vpa_premises_conditions_raw: string | null;
  vpa_source_verification_status: string;
  vpa_first_observed_at: string | null;
  vpa_last_observed_at: string | null;
  vpa_snapshot_reference_date: string | null;
  vpa_match_status: string;
  vpa_match_confidence: number | null;
  vpa_review_status: string;
  vpa_pbs_match_state: string;
  vpa_geocode_status: string;
  registered_licensees_state: "loaded" | "sign_in_required" | "unavailable";
  registered_licensees: Array<{
    id: string;
    licensee_name: string;
    license_status: string | null;
    licensed_until: string | null;
    conditions: string | null;
    first_observed_at: string | null;
    last_seen_at: string;
    currently_observed: boolean;
    other_active_premises_count: number | null;
  }>;
}
type PremisesDossierRow = Omit<PremisesDossier, "pbs_approvals" | "registered_licensees"> & {
  door_lat: number | null;
  door_lng: number | null;
};

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
  coverageState: "covered" | "truncated";
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
      const truncated = totalCount > items.length;
      return {
        items,
        totalCount,
        truncated,
        coverageState: truncated ? "truncated" : "covered",
        coverageNote: truncated
          ? `Showing ${items.length} of ${totalCount} pharmacies in view — zoom in to see them all. Regulatory verification remains unavailable.`
          : "Victorian pharmacy discovery dataset. Regulatory verification remains unavailable.",
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
  // abortSignal must be applied to the filter builder, before the terminal
  // .maybeSingle() narrows it to a PostgrestBuilder.
  const premisesQuery = supabase.from("pharmacy_premises_geo").select("*").eq("id", id);
  const premisesRequest = (
    signal ? premisesQuery.abortSignal(signal) : premisesQuery
  ).maybeSingle();
  const approvalsQuery = supabase
    .from("pbs_approvals")
    .select("approval_number, approval_status")
    .eq("premises_id", id);
  const approvalsRequest = signal ? approvalsQuery.abortSignal(signal) : approvalsQuery;
  const licenseesQuery = supabase
    .from("pharmacy_premises_licensees")
    .select(
      "id,licensee_name,license_status,licensed_until,conditions,first_observed_at,last_seen_at,currently_observed",
    )
    .eq("premises_id", id)
    .order("currently_observed", { ascending: false })
    .order("licensee_name");
  const licenseesRequest = signal ? licenseesQuery.abortSignal(signal) : licenseesQuery;

  const [premisesRes, approvalsRes, licenseesRes] = await Promise.all([
    premisesRequest,
    approvalsRequest,
    licenseesRequest,
  ]);
  if (premisesRes.error) throw new Error(premisesRes.error.message);
  if (approvalsRes.error) throw new Error(approvalsRes.error.message);
  if (!premisesRes.data) return null;

  const premises = premisesRes.data as unknown as PremisesDossierRow;
  const sourceQuery = premises.source_id
    ? supabase
        .from("source_records")
        .select("source_name, source_url, fetched_at")
        .eq("id", premises.source_id)
    : null;
  const sourceRes = sourceQuery
    ? await (signal ? sourceQuery.abortSignal(signal) : sourceQuery).maybeSingle()
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
    vpa_official_name: premises.vpa_official_name,
    vpa_official_full_address: premises.vpa_official_full_address,
    vpa_registration_status_raw: premises.vpa_registration_status_raw,
    vpa_registration_status_normalised: premises.vpa_registration_status_normalised,
    vpa_registered_until: premises.vpa_registered_until,
    vpa_premises_conditions_raw: premises.vpa_premises_conditions_raw,
    vpa_source_verification_status: premises.vpa_source_verification_status,
    vpa_first_observed_at: premises.vpa_first_observed_at,
    vpa_last_observed_at: premises.vpa_last_observed_at,
    vpa_snapshot_reference_date: premises.vpa_snapshot_reference_date,
    vpa_match_status: premises.vpa_match_status,
    vpa_match_confidence: premises.vpa_match_confidence,
    vpa_review_status: premises.vpa_review_status,
    vpa_pbs_match_state: premises.vpa_pbs_match_state,
    vpa_geocode_status: premises.vpa_geocode_status,
    registered_licensees_state: licenseesRes.error
      ? licenseesRes.error.code === "42501"
        ? "sign_in_required"
        : "unavailable"
      : "loaded",
    registered_licensees: (licenseesRes.data ?? []).map((licensee) => ({
      ...licensee,
      other_active_premises_count: null,
    })) as PremisesDossier["registered_licensees"],
  };
}
