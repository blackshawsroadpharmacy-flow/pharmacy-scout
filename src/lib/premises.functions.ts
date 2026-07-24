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
  pbs_approvals: Array<{ approval_number: string; approval_status: string }>;
}

export const listPremises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pharmacy_premises_geo")
      .select("*")
      .order("suburb", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const ids = rows.map((r) => r.id as string);
    const sourceIds = Array.from(
      new Set(rows.map((r) => r.source_id as string | null).filter((v): v is string => !!v)),
    );

    const [{ data: approvals, error: apErr }, { data: sources, error: srcErr }] = await Promise.all([
      ids.length
        ? context.supabase
            .from("pbs_approvals")
            .select("premises_id, approval_number, approval_status")
            .in("premises_id", ids)
        : Promise.resolve({ data: [], error: null }),
      sourceIds.length
        ? context.supabase
            .from("source_records")
            .select("id, source_name, source_url, fetched_at")
            .in("id", sourceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (apErr) throw new Error(apErr.message);
    if (srcErr) throw new Error(srcErr.message);

    const approvalsByPremises = new Map<string, PremisesRow["pbs_approvals"]>();
    for (const a of approvals ?? []) {
      const list = approvalsByPremises.get(a.premises_id as string) ?? [];
      list.push({ approval_number: a.approval_number, approval_status: a.approval_status });
      approvalsByPremises.set(a.premises_id as string, list);
    }
    const sourceById = new Map<string, { source_name: string; source_url: string | null; fetched_at: string | null }>();
    for (const s of sources ?? []) {
      sourceById.set(s.id as string, {
        source_name: s.source_name,
        source_url: s.source_url,
        fetched_at: s.fetched_at,
      });
    }

    return rows.map((r): PremisesRow => {
      const src = r.source_id ? sourceById.get(r.source_id as string) : undefined;
      return {
        id: r.id as string,
        name: r.name as string,
        address: r.address as string,
        suburb: r.suburb as string | null,
        postcode: r.postcode as string | null,
        locality_name: r.locality_name as string | null,
        lat: (r.lat as number | null) ?? null,
        lng: (r.lng as number | null) ?? null,
        door_lat: (r.door_lat as number | null) ?? null,
        door_lng: (r.door_lng as number | null) ?? null,
        door_source: r.door_source as string | null,
        door_verified_at: r.door_verified_at as string | null,
        vpa_registration_status: r.vpa_registration_status as string,
        vpa_registration_checked_at: r.vpa_registration_checked_at as string | null,
        premises_source: r.premises_source as string,
        source_confidence: r.source_confidence as string | null,
        source_name: src?.source_name ?? null,
        source_url: src?.source_url ?? null,
        source_fetched_at: src?.fetched_at ?? null,
        phone: r.phone as string | null,
        website: r.website as string | null,
        notes: r.notes as string | null,
        pbs_approvals: approvalsByPremises.get(r.id as string) ?? [],
      };
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
