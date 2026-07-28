/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stages = [
  "watchlist",
  "contacting",
  "im_received",
  "due_diligence",
  "offer",
  "passed",
  "acquired",
] as const;
const metrics = [
  "asking_price",
  "annual_rent",
  "revenue",
  "scripts_per_day",
  "gross_profit",
  "wages",
  "earnings",
  "stock_value",
] as const;

async function currentOrg(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .single();
  if (error || !data?.current_organisation_id) throw new Error("No organisation selected.");
  return data.current_organisation_id as string;
}

async function assertOpportunity(supabase: any, organisationId: string, opportunityId: string) {
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, business_id")
    .eq("id", opportunityId)
    .eq("organisation_id", organisationId)
    .eq("type", "acquisition")
    .single();
  if (error || !data) throw new Error("Opportunity not found in your organisation.");
  return data as { id: string; business_id: string | null };
}

export const getOpportunityWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ opportunity_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const org = await currentOrg(supabase, context.userId);
    const opportunity = await assertOpportunity(supabase, org, data.opportunity_id);
    const [opp, business, history, checklist, tasks, figures, notes, documents, listingHistory] =
      await Promise.all([
        supabase
          .from("opportunities")
          .select("id, title, summary, pipeline_stage, business_id, updated_at")
          .eq("id", opportunity.id)
          .single(),
        opportunity.business_id
          ? supabase
              .from("pharmacy_businesses")
              .select("*")
              .eq("id", opportunity.business_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("opportunity_stage_history")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("changed_at", { ascending: false }),
        supabase
          .from("opportunity_checklist_items")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("position"),
        supabase
          .from("opportunity_tasks")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("due_date", { nullsFirst: false }),
        supabase
          .from("opportunity_commercial_figures")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("entered_at", { ascending: false }),
        supabase
          .from("opportunity_notes")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("entered_at", { ascending: false }),
        supabase
          .from("opportunity_documents")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("uploaded_at", { ascending: false }),
        supabase
          .from("opportunity_listing_history")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("recorded_at", { ascending: false }),
      ]);
    for (const result of [
      opp,
      business,
      history,
      checklist,
      tasks,
      figures,
      notes,
      documents,
      listingHistory,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      opportunity: opp.data,
      business: business.data,
      stage_history: history.data ?? [],
      checklist: checklist.data ?? [],
      tasks: tasks.data ?? [],
      figures: figures.data ?? [],
      notes: notes.data ?? [],
      documents: documents.data ?? [],
      listing_history: listingHistory.data ?? [],
    };
  });

const businessSchema = z.object({
  opportunity_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  summary: z.string().max(4000).nullable(),
  pipeline_stage: z.enum(stages),
  vendor_name: z.string().max(200).nullable(),
  vendor_contact: z.string().max(500).nullable(),
  broker_name: z.string().max(200).nullable(),
  broker_contact: z.string().max(500).nullable(),
  listing_url: z.string().url().max(500).nullable(),
  listing_status: z.enum([
    "unknown",
    "off_market",
    "coming_soon",
    "listed",
    "under_offer",
    "sold",
    "withdrawn",
  ]),
  lease_expiry: z.string().date().nullable(),
  lease_option_periods: z.string().max(500).nullable(),
});

export const updateOpportunityWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => businessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const org = await currentOrg(supabase, context.userId);
    const opportunity = await assertOpportunity(supabase, org, data.opportunity_id);
    if (!opportunity.business_id) throw new Error("This opportunity has no linked business.");
    const { data: previous, error: previousError } = await supabase
      .from("pharmacy_businesses")
      .select("listing_status, listing_url")
      .eq("id", opportunity.business_id)
      .eq("organisation_id", org)
      .single();
    if (previousError) throw new Error(previousError.message);
    const { error: oppError } = await supabase
      .from("opportunities")
      .update({ title: data.title, summary: data.summary, pipeline_stage: data.pipeline_stage })
      .eq("id", opportunity.id)
      .eq("organisation_id", org);
    if (oppError) throw new Error(oppError.message);
    const { error } = await supabase
      .from("pharmacy_businesses")
      .update({
        trading_name: data.title,
        vendor_name: data.vendor_name,
        vendor_contact: data.vendor_contact,
        broker_name: data.broker_name,
        broker_contact: data.broker_contact,
        listing_url: data.listing_url,
        listing_status: data.listing_status,
        lease_expiry: data.lease_expiry,
        lease_option_periods: data.lease_option_periods,
      })
      .eq("id", opportunity.business_id)
      .eq("organisation_id", org);
    if (error) throw new Error(error.message);
    if (
      previous.listing_status !== data.listing_status ||
      previous.listing_url !== data.listing_url
    ) {
      const { error: historyError } = await supabase.from("opportunity_listing_history").insert({
        organisation_id: org,
        opportunity_id: opportunity.id,
        listing_status: data.listing_status,
        listing_url: data.listing_url,
        source: "Organisation member update",
        confidence: "high",
        entered_by: context.userId,
      });
      if (historyError) throw new Error(historyError.message);
    }
    return { ok: true };
  });

const childSchema = z.object({
  opportunity_id: z.string().uuid(),
  kind: z.enum(["checklist", "task", "note", "figure"]),
  title: z.string().max(10000).optional(),
  owner_name: z.string().max(200).nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  metric: z.enum(metrics).optional(),
  amount: z.number().optional(),
  unit: z.enum(["AUD", "AUD_per_year", "scripts_per_day"]).optional(),
  source: z.string().max(500).optional(),
  evidence_period_start: z.string().date().nullable().optional(),
  evidence_period_end: z.string().date().nullable().optional(),
  confidence: z.enum(["unverified", "low", "medium", "high"]).optional(),
});

export const addOpportunityItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => childSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const org = await currentOrg(supabase, context.userId);
    await assertOpportunity(supabase, org, data.opportunity_id);
    let table: string;
    let row: Record<string, unknown> = {
      organisation_id: org,
      opportunity_id: data.opportunity_id,
    };
    if (data.kind === "checklist") {
      table = "opportunity_checklist_items";
      row = { ...row, label: z.string().min(1).parse(data.title), created_by: context.userId };
    } else if (data.kind === "task") {
      table = "opportunity_tasks";
      row = {
        ...row,
        title: z.string().min(1).parse(data.title),
        owner_name: data.owner_name ?? null,
        due_date: data.due_date ?? null,
        created_by: context.userId,
      };
    } else if (data.kind === "note") {
      table = "opportunity_notes";
      row = { ...row, note_text: z.string().min(1).parse(data.title), entered_by: context.userId };
    } else {
      table = "opportunity_commercial_figures";
      if (!data.metric || data.amount == null || !data.unit || !data.source) {
        throw new Error("Commercial figures require value, unit, source and provenance.");
      }
      row = {
        ...row,
        metric: data.metric,
        amount: data.amount,
        unit: data.unit,
        source: data.source,
        evidence_period_start: data.evidence_period_start ?? null,
        evidence_period_end: data.evidence_period_end ?? null,
        confidence: data.confidence ?? "unverified",
        entered_by: context.userId,
      };
    }
    const { error } = await supabase.from(table).insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleOpportunityItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        opportunity_id: z.string().uuid(),
        kind: z.enum(["checklist", "task"]),
        id: z.string().uuid(),
        completed: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const org = await currentOrg(supabase, context.userId);
    await assertOpportunity(supabase, org, data.opportunity_id);
    const table = data.kind === "task" ? "opportunity_tasks" : "opportunity_checklist_items";
    const { error } = await supabase
      .from(table)
      .update({
        completed: data.completed,
        completed_at: data.completed ? new Date().toISOString() : null,
        ...(data.kind === "checklist"
          ? { completed_by: data.completed ? context.userId : null }
          : {}),
      })
      .eq("id", data.id)
      .eq("organisation_id", org)
      .eq("opportunity_id", data.opportunity_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registerOpportunityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        opportunity_id: z.string().uuid(),
        storage_path: z.string().max(1000),
        file_name: z.string().min(1).max(300),
        mime_type: z.string().max(200).nullable(),
        size_bytes: z.number().int().positive().max(26214400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const org = await currentOrg(supabase, context.userId);
    await assertOpportunity(supabase, org, data.opportunity_id);
    if (!data.storage_path.startsWith(`${org}/opportunities/${data.opportunity_id}/`)) {
      throw new Error("Invalid document storage path.");
    }
    const { error } = await supabase.from("opportunity_documents").insert({
      ...data,
      organisation_id: org,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOpportunityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        opportunity_id: z.string().uuid(),
        document_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const org = await currentOrg(supabase, context.userId);
    await assertOpportunity(supabase, org, data.opportunity_id);
    const { error } = await supabase
      .from("opportunity_documents")
      .delete()
      .eq("id", data.document_id)
      .eq("organisation_id", org)
      .eq("opportunity_id", data.opportunity_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
