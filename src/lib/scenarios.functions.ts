/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const point = z.object({
  lat: z.number().min(-39.2).max(-33.98),
  lng: z.number().min(140.96).max(149.98),
});
const common = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable(),
  address_source: z.string().url().max(1000).nullable(),
  point,
  coordinate_quality: z.string().min(1).max(100),
  coordinate_confidence: z.number().min(0).max(1).nullable(),
  radius_m: z.number().int().min(100).max(20000),
  notes: z.string().max(5000).nullable(),
});

async function org(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .single();
  if (error || !data?.current_organisation_id) throw new Error("No organisation selected.");
  return data.current_organisation_id as string;
}
const geography = (p: { lat: number; lng: number }) => `POINT(${p.lng} ${p.lat})`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ids = (snapshot: any, key: string) =>
  new Set<string>((snapshot?.[key] ?? []).map((item: any) => item.id));
const delta = (origin: any, destination: any, key: string) => {
  const a = ids(origin, key);
  const b = ids(destination, key);
  return { gained: [...b].filter((id) => !a.has(id)), lost: [...a].filter((id) => !b.has(id)) };
};
const changeSummary = (previous: any, current: any) => {
  if (!previous) return { initial_assessment: true };
  const count = (value: any, key: string) => value?.[key]?.length ?? null;
  const keys = [
    "pharmacies_within_radius",
    "medical_centres_within_500m",
    "supermarkets_within_500m",
  ];
  return {
    initial_assessment: false,
    component_count_changes: Object.fromEntries(
      keys.map((key) => [key, { before: count(previous, key), after: count(current, key) }]),
    ),
    assessment_label: {
      before: previous.assessment_label ?? null,
      after: current.assessment_label ?? null,
    },
    source_coverage_changed:
      JSON.stringify(previous.source_coverage) !== JSON.stringify(current.source_coverage),
    warning_count: {
      before: previous.required_caveats?.length ?? null,
      after: current.required_caveats?.length ?? null,
    },
  };
};

export const listScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const organisationId = await org(supabase, context.userId);
    const [greenfield, relocation] = await Promise.all([
      supabase
        .from("greenfield_scenarios")
        .select("*, greenfield_assessments(*)")
        .eq("organisation_id", organisationId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("relocation_scenarios")
        .select("*, relocation_assessments(*)")
        .eq("organisation_id", organisationId)
        .eq("orphaned_demo", false)
        .order("updated_at", { ascending: false }),
    ]);
    if (greenfield.error) throw new Error(greenfield.error.message);
    if (relocation.error) throw new Error(relocation.error.message);
    return { greenfield: greenfield.data ?? [], relocation: relocation.data ?? [] };
  });

export const searchScenarioOrigins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().min(2).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    await org(supabase, context.userId);
    const result = await supabase
      .from("pharmacy_premises")
      .select("id,name,address")
      .or(
        `name.ilike.%${data.query.replaceAll(",", " ")}%,address.ilike.%${data.query.replaceAll(",", " ")}%`,
      )
      .not("location", "is", null)
      .limit(20);
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  });

export const createGreenfieldScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => common.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const organisationId = await org(supabase, context.userId);
    const inputs = {
      address_source: data.address_source,
      coordinate_quality: data.coordinate_quality,
      coordinate_confidence: data.coordinate_confidence,
      analysis_radius_m: data.radius_m,
    };
    const { data: row, error } = await supabase
      .from("greenfield_scenarios")
      .insert({
        organisation_id: organisationId,
        name: data.name,
        proposed_address: data.address,
        proposed_location: geography(data.point),
        proposed_lat: data.point.lat,
        proposed_lng: data.point.lng,
        notes: data.notes,
        created_by: context.userId,
        inputs,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return recalcGreenfield(
      supabase,
      organisationId,
      context.userId,
      row.id,
      data.point,
      data.radius_m,
    );
  });

const relocationSchema = common.extend({ origin_pharmacy_id: z.string().uuid() });
export const createRelocationScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => relocationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const organisationId = await org(supabase, context.userId);
    const { data: origins, error: originError } = await supabase.rpc("scenario_origin_pharmacy", {
      p_pharmacy_id: data.origin_pharmacy_id,
    });
    if (originError || !origins?.[0])
      throw new Error("A mapped existing pharmacy is required as the relocation origin.");
    const inputs = {
      address_source: data.address_source,
      coordinate_quality: data.coordinate_quality,
      coordinate_confidence: data.coordinate_confidence,
      analysis_radius_m: data.radius_m,
    };
    const { data: row, error } = await supabase
      .from("relocation_scenarios")
      .insert({
        organisation_id: organisationId,
        name: data.name,
        origin_pharmacy_id: data.origin_pharmacy_id,
        destination_address: data.address,
        destination_location: geography(data.point),
        destination_lat: data.point.lat,
        destination_lng: data.point.lng,
        actor_id: context.userId,
        created_by: context.userId,
        notes: data.notes,
        inputs,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return recalcRelocation(
      supabase,
      organisationId,
      context.userId,
      row.id,
      origins[0],
      data.point,
      data.radius_m,
    );
  });

const actionSchema = z.object({
  type: z.enum(["greenfield", "relocation"]),
  id: z.string().uuid(),
  action: z.enum(["archive", "reopen", "duplicate"]),
});
export const changeScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => actionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const organisationId = await org(supabase, context.userId);
    const table = data.type === "greenfield" ? "greenfield_scenarios" : "relocation_scenarios";
    if (data.action !== "duplicate") {
      const { error } = await supabase
        .from(table)
        .update({ archived_at: data.action === "archive" ? new Date().toISOString() : null })
        .eq("id", data.id)
        .eq("organisation_id", organisationId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { data: original, error } = await supabase
      .from(table)
      .select("*")
      .eq("id", data.id)
      .eq("organisation_id", organisationId)
      .single();
    if (error) throw new Error(error.message);
    const {
      id: _id,
      created_at: _created,
      updated_at: _updated,
      archived_at: _archived,
      ...copy
    } = original;
    const created = await supabase
      .from(table)
      .insert({
        ...copy,
        name: `${original.name} (copy)`,
        duplicated_from: original.id,
        archived_at: null,
        actor_id: data.type === "relocation" ? context.userId : undefined,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    return { id: created.data.id };
  });

const recalcSchema = z.object({
  type: z.enum(["greenfield", "relocation"]),
  id: z.string().uuid(),
  point,
  radius_m: z.number().int().min(100).max(20000),
});
export const recalculateScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recalcSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const organisationId = await org(supabase, context.userId);
    if (data.type === "greenfield") {
      const found = await supabase
        .from("greenfield_scenarios")
        .select("id")
        .eq("id", data.id)
        .eq("organisation_id", organisationId)
        .single();
      if (found.error) throw new Error("Scenario not found.");
      return recalcGreenfield(
        supabase,
        organisationId,
        context.userId,
        data.id,
        data.point,
        data.radius_m,
      );
    }
    const found = await supabase
      .from("relocation_scenarios")
      .select("origin_pharmacy_id")
      .eq("id", data.id)
      .eq("organisation_id", organisationId)
      .single();
    if (found.error) throw new Error("Scenario not found.");
    const origin = await supabase.rpc("scenario_origin_pharmacy", {
      p_pharmacy_id: found.data.origin_pharmacy_id,
    });
    if (origin.error || !origin.data?.[0]) throw new Error("Relocation origin is unavailable.");
    return recalcRelocation(
      supabase,
      organisationId,
      context.userId,
      data.id,
      origin.data[0],
      data.point,
      data.radius_m,
    );
  });

async function evidence(supabase: any, p: { lat: number; lng: number }, radius: number) {
  const result = await supabase.rpc("scenario_evidence_at_point", {
    p_lat: p.lat,
    p_lng: p.lng,
    p_radius_m: radius,
  });
  if (result.error) throw new Error(result.error.message);
  return { ...result.data, requested_radius_m: radius };
}
async function recalcGreenfield(
  supabase: any,
  organisationId: string,
  userId: string,
  id: string,
  p: any,
  radius: number,
) {
  const snapshot = await evidence(supabase, p, radius);
  const prior = await supabase
    .from("greenfield_assessments")
    .select("*")
    .eq("scenario_id", id)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequence = (prior.data?.sequence_number ?? 0) + 1;
  const inserted = await supabase
    .from("greenfield_assessments")
    .insert({
      organisation_id: organisationId,
      scenario_id: id,
      sequence_number: sequence,
      evidence_snapshot: snapshot,
      change_summary: changeSummary(prior.data?.evidence_snapshot, snapshot),
      evidence_hash: hash(snapshot),
      assessed_by: userId,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return { id, assessment_id: inserted.data.id, sequence_number: sequence };
}
async function recalcRelocation(
  supabase: any,
  organisationId: string,
  userId: string,
  id: string,
  origin: any,
  destination: any,
  radius: number,
) {
  const [originEvidence, destinationEvidence] = await Promise.all([
    evidence(supabase, { lat: origin.lat, lng: origin.lng }, radius),
    evidence(supabase, destination, radius),
  ]);
  const metres = Math.round(
    6371000 *
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin(((destination.lat - origin.lat) * Math.PI) / 180 / 2) ** 2 +
            Math.cos((origin.lat * Math.PI) / 180) *
              Math.cos((destination.lat * Math.PI) / 180) *
              Math.sin(((destination.lng - origin.lng) * Math.PI) / 180 / 2) ** 2,
        ),
      ),
  );
  const comparison = {
    origin_to_destination_distance_m: metres,
    pharmacies: delta(originEvidence, destinationEvidence, "pharmacies_within_radius"),
    medical_centres: delta(originEvidence, destinationEvidence, "medical_centres_within_500m"),
    supermarkets: delta(originEvidence, destinationEvidence, "supermarkets_within_500m"),
    population_context:
      "Not available in the database snapshot; compare sourced ABS context separately",
    origin_coordinate_quality: origin.coordinate_quality,
    origin_unresolved_conflicts: origin.unresolved_conflicts,
    caveats: [
      "Professional public-door measurement required",
      "Legal review required; this is not a Pharmacy Location Rule conclusion",
    ],
  };
  const prior = await supabase
    .from("relocation_assessments")
    .select("sequence_number,destination_evidence_snapshot,comparison_snapshot")
    .eq("scenario_id", id)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequence = (prior.data?.sequence_number ?? 0) + 1;
  const payload = { originEvidence, destinationEvidence, comparison };
  const inserted = await supabase
    .from("relocation_assessments")
    .insert({
      organisation_id: organisationId,
      scenario_id: id,
      sequence_number: sequence,
      origin_evidence_snapshot: originEvidence,
      destination_evidence_snapshot: destinationEvidence,
      comparison_snapshot: comparison,
      change_summary: {
        destination: changeSummary(prior.data?.destination_evidence_snapshot, destinationEvidence),
        relocation_comparison_changed:
          JSON.stringify(prior.data?.comparison_snapshot ?? null) !== JSON.stringify(comparison),
      },
      evidence_hash: hash(payload),
      assessed_by: userId,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return { id, assessment_id: inserted.data.id, sequence_number: sequence };
}
