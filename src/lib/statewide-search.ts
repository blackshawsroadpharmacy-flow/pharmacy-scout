import { supabase } from "@/integrations/supabase/client";

export type StatewideSearchType =
  | "pharmacy"
  | "vpa_pharmacy"
  | "supermarket"
  | "medical_centre"
  | "aged_care"
  | "acquisition_opportunity"
  | "candidate_site";

export interface StatewideSearchResult {
  result_type: StatewideSearchType;
  result_id: string;
  result_name: string;
  result_address: string | null;
  result_suburb: string | null;
  result_postcode: string | null;
  lat: number | null;
  lng: number | null;
  source_confidence: string | null;
  registration_source_status?: string | null;
  is_private: boolean;
  relevance: number;
}

export const STATEWIDE_SEARCH_LIMIT = 24;

export function hasVerifiedSearchCoordinates(
  result: Pick<StatewideSearchResult, "lat" | "lng">,
): result is Pick<StatewideSearchResult, "lat" | "lng"> & { lat: number; lng: number } {
  return (
    typeof result.lat === "number" &&
    Number.isFinite(result.lat) &&
    result.lat >= -40 &&
    result.lat <= -33 &&
    typeof result.lng === "number" &&
    Number.isFinite(result.lng) &&
    result.lng >= 140 &&
    result.lng <= 150
  );
}

function resultKey(result: StatewideSearchResult): string {
  return ["pharmacy", "vpa_pharmacy"].includes(result.result_type)
    ? `pharmacy:${result.result_id}`
    : `${result.result_type}:${result.result_id}`;
}

function richness(result: StatewideSearchResult): number {
  return (
    (result.result_type === "vpa_pharmacy" ? 8 : 0) +
    (result.registration_source_status ? 4 : 0) +
    (result.result_address ? 2 : 0) +
    (hasVerifiedSearchCoordinates(result) ? 1 : 0)
  );
}

export function deduplicateStatewideResults(
  results: StatewideSearchResult[],
): StatewideSearchResult[] {
  const deduplicated = new Map<string, StatewideSearchResult>();
  for (const result of results) {
    const key = resultKey(result);
    const existing = deduplicated.get(key);
    if (!existing || richness(result) > richness(existing)) {
      deduplicated.set(key, {
        ...result,
        source_confidence: result.source_confidence ?? existing?.source_confidence ?? null,
        registration_source_status:
          result.registration_source_status ?? existing?.registration_source_status ?? null,
      });
    }
  }
  return [...deduplicated.values()];
}

export async function searchStatewideLocations(
  query: string,
  signal?: AbortSignal,
  includeVpaRegistry = false,
): Promise<StatewideSearchResult[]> {
  const normalized = query.trim();
  const containsControlCharacter = [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (normalized.length < 2 || normalized.length > 120 || containsControlCharacter) {
    return [];
  }

  let request = supabase.rpc("statewide_location_search", {
    p_query: normalized,
    p_limit: STATEWIDE_SEARCH_LIMIT,
  } as never);
  if (signal) request = request.abortSignal(signal);
  const registryRequest = includeVpaRegistry
    ? supabase.rpc("vpa_registry_search", {
        p_query: normalized,
        p_limit: STATEWIDE_SEARCH_LIMIT,
        p_offset: 0,
      })
    : null;
  if (signal && registryRequest) registryRequest.abortSignal(signal);
  const [{ data, error }, registryResult] = await Promise.all([request, registryRequest]);
  if (error) throw new Error(error.message);
  if (registryResult?.error) throw new Error(registryResult.error.message);
  const combined = [
    ...((data ?? []) as unknown as StatewideSearchResult[]),
    ...((registryResult?.data ?? []) as unknown as StatewideSearchResult[]).map((result) => ({
      ...result,
      is_private: false,
    })),
  ];
  return deduplicateStatewideResults(combined)
    .sort((left, right) => right.relevance - left.relevance)
    .slice(0, STATEWIDE_SEARCH_LIMIT);
}

export interface PublicDataFreshness {
  latest_pharmacy_import: string | null;
  latest_supermarket_import: string | null;
  latest_medical_centre_import: string | null;
  abs_reference_period: string;
  schema_version: string;
}

export async function fetchPublicDataFreshness(): Promise<PublicDataFreshness> {
  const { data, error } = await supabase.rpc("public_data_freshness");
  if (error) throw new Error(error.message);
  return data as unknown as PublicDataFreshness;
}
