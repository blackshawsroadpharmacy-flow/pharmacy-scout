import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAGES = [
  "watchlist",
  "contacting",
  "im_received",
  "due_diligence",
  "offer",
  "passed",
  "acquired",
] as const;

export const PIPELINE_STAGES = STAGES;

async function requireCurrentOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const org = data?.current_organisation_id as string | null | undefined;
  if (!org) throw new Error("No organisation selected. Create or select an organisation first.");
  return org;
}

export const listBusinesses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const org = await requireCurrentOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("pharmacy_businesses")
      .select(
        "id, trading_name, opportunity_status, asking_price, broker_or_source, listing_url, private_notes, created_at, updated_at",
      )
      .eq("organisation_id", org)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: opps, error: oppErr } = await context.supabase
      .from("opportunities")
      .select("id, business_id, pipeline_stage, title, summary, updated_at")
      .eq("organisation_id", org)
      .eq("type", "acquisition");
    if (oppErr) throw new Error(oppErr.message);
    return { businesses: data ?? [], opportunities: opps ?? [] };
  });

const createSchema = z.object({
  trading_name: z.string().min(2).max(200),
  broker_or_source: z.string().max(200).optional().nullable(),
  asking_price: z.number().nullable().optional(),
  listing_url: z.string().url().max(500).optional().nullable(),
  private_notes: z.string().max(4000).optional().nullable(),
  pipeline_stage: z.enum(STAGES).default("watchlist"),
});

export const createBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireCurrentOrg(context.supabase, context.userId);
    const { data: businessId, error } = await context.supabase.rpc(
      "create_acquisition_business" as never,
      {
        p_trading_name: data.trading_name,
        p_broker_or_source: data.broker_or_source ?? null,
        p_asking_price: data.asking_price ?? null,
        p_listing_url: data.listing_url ?? null,
        p_private_notes: data.private_notes ?? null,
        p_pipeline_stage: data.pipeline_stage,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { id: businessId as string };
  });

export const moveOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        opportunity_id: z.string().uuid(),
        pipeline_stage: z.enum(STAGES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const org = await requireCurrentOrg(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("opportunities")
      .update({ pipeline_stage: data.pipeline_stage })
      .eq("id", data.opportunity_id)
      .eq("organisation_id", org);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateBusinessNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        business_id: z.string().uuid(),
        private_notes: z.string().max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const org = await requireCurrentOrg(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("pharmacy_businesses")
      .update({ private_notes: data.private_notes })
      .eq("id", data.business_id)
      .eq("organisation_id", org);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
