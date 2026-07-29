import {
  prepareVpaRefresh,
  staleVpaPremises,
  type ExistingPremises,
  type VpaRecord,
} from "./vpa-refresh";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type PharmacyPremisesInsert = Database["public"]["Tables"]["pharmacy_premises"]["Insert"];
type PharmacyLicenseeInsert = Database["public"]["Tables"]["pharmacy_premises_licensees"]["Insert"];

export type VpaRefreshSummary = {
  premises_added: number;
  premises_updated: number;
  premises_removed: number;
  licensees_upserted: number;
  duration_ms: number;
  postcodes_queried: number;
  errors: string[];
};

export async function authorizeVpaAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function runVpaRefresh(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  records: VpaRecord[];
  postcodesQueried: number;
  capWarnings: number;
  errors: string[];
  checksumPayload: string;
  emit: (event: Record<string, unknown>) => void;
}): Promise<VpaRefreshSummary> {
  const started = Date.now();
  const syncedAt = new Date().toISOString();
  const { supabase } = input;

  const { data: source, error: sourceError } = await supabase
    .from("source_records")
    .select("id")
    .eq("source_key", "vpa_public_register")
    .single();
  if (sourceError || !source) throw new Error(sourceError?.message ?? "VPA source is missing");

  const { data: run, error: runError } = await supabase
    .from("pharmacy_vpa_runs")
    .insert({ status: "running", triggered_by: input.userId })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Could not create VPA run");

  try {
    const { data: existingData, error: existingError } = await supabase
      .from("pharmacy_premises")
      .select("id,name,address,suburb,postcode,vpa_record_key");
    if (existingError) throw new Error(existingError.message);
    const existing = (existingData ?? []) as unknown as ExistingPremises[];
    const prepared = prepareVpaRefresh(input.records, existing, source.id, syncedAt);
    const stale = staleVpaPremises(existing, prepared.currentKeys);

    input.emit({ phase: "upserting", premises_added: 0, premises_updated: 0 });
    for (let offset = 0; offset < prepared.premises.length; offset += 200) {
      const batch = prepared.premises.slice(offset, offset + 200) as PharmacyPremisesInsert[];
      const { error } = await supabase.from("pharmacy_premises").upsert(batch, {
        onConflict: "id",
      });
      if (error) throw new Error(error.message);
      input.emit({
        phase: "upserting",
        premises_added: Math.min(prepared.premisesAdded, offset + batch.length),
        premises_updated: Math.min(prepared.premisesUpdated, offset + batch.length),
      });
    }

    if (stale.length) {
      for (let offset = 0; offset < stale.length; offset += 200) {
        const ids = stale.slice(offset, offset + 200).map((row) => row.id);
        const { error } = await supabase
          .from("pharmacy_premises")
          .update({
            vpa_registration_status: "unverified",
            vpa_registration_checked_at: syncedAt,
            vpa_last_synced_at: syncedAt,
          })
          .in("id", ids);
        if (error) throw new Error(error.message);
      }
    }

    const { error: clearError } = await supabase
      .from("pharmacy_premises_licensees")
      .delete()
      .eq("vpa_source_id", source.id);
    if (clearError) throw new Error(clearError.message);

    for (let offset = 0; offset < prepared.licensees.length; offset += 500) {
      const { error } = await supabase
        .from("pharmacy_premises_licensees")
        .upsert(prepared.licensees.slice(offset, offset + 500) as PharmacyLicenseeInsert[], {
          onConflict: "vpa_record_key,licensee_name",
        });
      if (error) throw new Error(error.message);
    }

    const checksum = await sha256(input.checksumPayload);
    const { error: sourceUpdateError } = await supabase
      .from("source_records")
      .update({
        fetched_at: syncedAt,
        row_count: prepared.premises.length,
        checksum,
        confidence: "authoritative",
      })
      .eq("id", source.id);
    if (sourceUpdateError) throw new Error(sourceUpdateError.message);

    const summary: VpaRefreshSummary = {
      premises_added: prepared.premisesAdded,
      premises_updated: prepared.premisesUpdated,
      premises_removed: stale.length,
      licensees_upserted: prepared.licensees.length,
      duration_ms: Date.now() - started,
      postcodes_queried: input.postcodesQueried,
      errors: input.errors,
    };
    const { error: finishError } = await supabase
      .from("pharmacy_vpa_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: input.errors.length ? "error" : "ok",
        error_message: input.errors.length ? input.errors.join("\n").slice(0, 10_000) : null,
        postcodes_with_cap_warning: input.capWarnings,
        premises_added: summary.premises_added,
        premises_updated: summary.premises_updated,
        premises_removed: summary.premises_removed,
        licensees_upserted: summary.licensees_upserted,
        duration_ms: summary.duration_ms,
        postcodes_queried: summary.postcodes_queried,
      })
      .eq("id", run.id);
    if (finishError) throw new Error(finishError.message);
    return summary;
  } catch (error) {
    await supabase
      .from("pharmacy_vpa_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "error",
        duration_ms: Date.now() - started,
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
