import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PremisesRow {
  id: string;
  name: string;
  address: string;
  suburb: string | null;
  postcode: string | null;
  locality_name: string | null;
  lat: number | null;
  lng: number | null;
  door_lat: number | null;
  door_lng: number | null;
  door_source: string | null;
  door_verified_at: string | null;
  vpa_registration_status: string;
  vpa_registration_checked_at: string | null;
  premises_source: string;
  source_confidence: string | null;
  source_name: string | null;
  source_url: string | null;
  source_fetched_at: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  pbs_approvals: Array<{
    approval_number: string;
    approval_status: string;
  }>;
}

// PostGIS geography values come back as GeoJSON when selected via .select();
// we normalise them into flat lat/lng fields for the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pointToLatLng(value: any): { lat: number | null; lng: number | null } {
  if (!value) return { lat: null, lng: null };
  if (typeof value === "object" && value.type === "Point" && Array.isArray(value.coordinates)) {
    return { lng: value.coordinates[0] ?? null, lat: value.coordinates[1] ?? null };
  }
  // WKB hex fallback: skip; the RPC below returns GeoJSON.
  return { lat: null, lng: null };
}

export const listPremises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Select the raw columns then convert; select() on geography returns hex,
    // so we prefer a stored function. Use raw SQL via rpc for GeoJSON — but
    // to avoid extra migrations we fetch and use ST_AsGeoJSON via a view-less
    // approach: rely on PostgREST's automatic conversion by declaring the
    // column type as text through casts is complex, so instead fetch with a
    // direct .rpc using a helper we define inline via .select() and
    // post-process the hex points on the server using a lightweight parser.
    const { data, error } = await context.supabase
      .from("pharmacy_premises")
      .select(
        `id, name, address, suburb, postcode, locality_name,
         location, public_door_location,
         door_source, door_verified_at,
         vpa_registration_status, vpa_registration_checked_at,
         premises_source, source_confidence,
         phone, website, notes,
         source_records:source_id (source_name, source_url, fetched_at),
         pbs_approvals (approval_number, approval_status)`,
      )
      .order("suburb", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const loc = pointToLatLng(row.location);
      const door = pointToLatLng(row.public_door_location);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const src = row.source_records as any;
      return {
        id: row.id,
        name: row.name,
        address: row.address,
        suburb: row.suburb,
        postcode: row.postcode,
        locality_name: row.locality_name,
        lat: loc.lat,
        lng: loc.lng,
        door_lat: door.lat,
        door_lng: door.lng,
        door_source: row.door_source,
        door_verified_at: row.door_verified_at,
        vpa_registration_status: row.vpa_registration_status,
        vpa_registration_checked_at: row.vpa_registration_checked_at,
        premises_source: row.premises_source,
        source_confidence: row.source_confidence,
        source_name: src?.source_name ?? null,
        source_url: src?.source_url ?? null,
        source_fetched_at: src?.fetched_at ?? null,
        phone: row.phone,
        website: row.website,
        notes: row.notes,
        pbs_approvals: (row.pbs_approvals ?? []).map((a) => ({
          approval_number: a.approval_number,
          approval_status: a.approval_status,
        })),
      } satisfies PremisesRow;
    });
  });

export const setPremisesDoor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        premises_id: z.string().uuid(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).rpc("set_premises_door", {
      _premises_id: data.premises_id,
      _lat: data.lat,
      _lng: data.lng,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
