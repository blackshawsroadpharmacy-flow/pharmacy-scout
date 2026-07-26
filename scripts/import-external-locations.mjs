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
const { data, error } = await supabase.rpc("import_external_location_batch", {
  p_source_key: SOURCE_KEY,
  p_category: category,
  p_fetched_at: fetchedAt,
  p_records: prepared.accepted,
  p_rejected: prepared.rejected,
  p_duplicate_candidates: prepared.duplicateCandidates,
  p_metrics: summary,
});
if (error) throw new Error(error.message);
console.log(JSON.stringify({ ...summary, database: data }, null, 2));
