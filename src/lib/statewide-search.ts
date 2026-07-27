import { supabase } from "@/integrations/supabase/client";

export type StatewideSearchType =
  "pharmacy" | "supermarket" | "medical_centre" | "acquisition_opportunity" | "candidate_site";

export interface StatewideSearchResult {
  result_type: StatewideSearchType;
  result_id: string;
  result_name: string;
  result_address: string | null;
  result_suburb: string | null;
  result_postcode: string | null;
  lat: number | null;
  lng: number | null;
  source_confidence: string;
  is_private: boolean;
  relevance: number;
}

export const STATEWIDE_SEARCH_LIMIT = 24;

export async function searchStatewideLocations(
  query: string,
  signal?: AbortSignal,
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
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StatewideSearchResult[];
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
