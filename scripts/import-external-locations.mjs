import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { SOURCE_KEY, fetchOverpass, prepareImport } from "./lib/external-location-import.mjs";

const categoryIndex = process.argv.indexOf("--category");
const category = categoryIndex >= 0 ? process.argv[categoryIndex + 1] : null;
const push = process.argv.includes("--push");
const dryRun = process.argv.includes("--dry-run") || !push;
const allowed = new Set(["supermarkets", "medical_centres"]);

if (!allowed.has(category)) {
  throw new Error("--category must be supermarkets or medical_centres");
}

const started = Date.now();
const fetchedAt = new Date().toISOString();
const payload = await fetchOverpass(category);
const prepared = prepareImport(category, payload, fetchedAt);
const summary = {
  category,
  source: SOURCE_KEY,
  mode: dryRun ? "dry_run" : "push",
  duration_ms: Date.now() - started,
  ...prepared.metrics,
};

if (dryRun) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --push");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: source, error: sourceError } = await supabase
  .from("external_source_registry")
  .select("id")
  .eq("source_key", SOURCE_KEY)
  .single();
if (sourceError || !source) {
  throw new Error(sourceError?.message ?? "External source registry row not found");
}
const { data, error } = await supabase.rpc("import_external_location_batch", {
  p_source_key: SOURCE_KEY,
  p_category: category,
  p_fetched_at: fetchedAt,
  p_records: prepared.accepted,
  // Rejected records are written below. Keeping them outside the canonical upsert
  // makes a malformed rejected payload incapable of rolling back accepted records.
  p_rejected: [],
  p_duplicate_candidates: prepared.duplicateCandidates,
  p_metrics: summary,
});
if (error) throw new Error(error.message);
if (prepared.rejected.length) {
  const rejectedRows = prepared.rejected.map((record) => ({
    source_id: source.id,
    import_run_id: data.import_run_id,
    category,
    source_record_id: record.source_record_id ?? `rejected:${record.record_hash}`,
    source_url: record.source_url,
    fetched_at: fetchedAt,
    observed_at: record.observed_at,
    raw_payload: record.raw_payload,
    record_hash: record.record_hash,
    disposition: record.rejection_reasons.includes("out_of_state") ? "out_of_state" : "rejected",
    rejection_reason: JSON.stringify(record.rejection_reasons),
  }));
  const { error: rejectedError } = await supabase
    .from("external_raw_records")
    .upsert(rejectedRows, {
      onConflict: "source_id,category,source_record_id,record_hash",
      ignoreDuplicates: true,
    });
  if (rejectedError) throw new Error(rejectedError.message);
  const { error: metricsError } = await supabase
    .from("external_import_runs")
    .update({ rejected_count: prepared.rejected.length })
    .eq("id", data.import_run_id);
  if (metricsError) throw new Error(metricsError.message);
}
console.log(JSON.stringify({ ...summary, database: data }, null, 2));
