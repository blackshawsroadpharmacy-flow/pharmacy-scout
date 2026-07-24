import { supabase } from "@/integrations/supabase/client";

export type VerificationStatus = "unverified" | "matched" | "verified" | "conflict";

export interface PublicPremises {
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
  source_id: string | null;
  door_lat: number | null;
  door_lng: number | null;
}

export interface PremisesDossier extends PublicPremises {
  source_name: string | null;
  source_url: string | null;
  source_fetched_at: string | null;
  pbs_approvals: Array<{ approval_number: string; approval_status: string }>;
  nearest: Array<{ id: string; name: string; suburb: string | null; distance_m: number }>;
}

export async function fetchAllPremises(): Promise<PublicPremises[]> {
  const { data, error } = await supabase
    .from("pharmacy_premises_geo")
    .select(
      "id, name, address, suburb, postcode, locality_name, lat, lng, vpa_registration_status, premises_source, source_confidence, source_id, door_lat, door_lng",
    )
    .not("lat", "is", null)
    .not("lng", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicPremises[];
}

function haversine(a: PublicPremises, b: PublicPremises) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function fetchDossier(
  id: string,
  all: PublicPremises[],
): Promise<PremisesDossier | null> {
  const p = all.find((x) => x.id === id);
  if (!p) return null;

  const [approvalsRes, sourceRes] = await Promise.all([
    supabase
      .from("pbs_approvals")
      .select("approval_number, approval_status")
      .eq("premises_id", id),
    p.source_id
      ? supabase
          .from("source_records")
          .select("source_name, source_url, fetched_at")
          .eq("id", p.source_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  const nearest = all
    .filter((o) => o.id !== id)
    .map((o) => ({
      id: o.id,
      name: o.name,
      suburb: o.suburb,
      distance_m: haversine(p, o),
    }))
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 5);

  return {
    ...p,
    source_name: sourceRes.data?.source_name ?? null,
    source_url: sourceRes.data?.source_url ?? null,
    source_fetched_at: sourceRes.data?.fetched_at ?? null,
    pbs_approvals: (approvalsRes.data ?? []) as PremisesDossier["pbs_approvals"],
    nearest,
  };
}
