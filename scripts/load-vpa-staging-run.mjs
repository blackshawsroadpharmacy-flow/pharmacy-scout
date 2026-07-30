#!/usr/bin/env node
/**
 * Load an approved VPA decision ledger into the staging tables.
 *
 * This script writes ONLY to the private VPA staging tables:
 *   pharmacy_vpa_runs, pharmacy_vpa_raw_source_rows,
 *   pharmacy_vpa_staged_premises, pharmacy_vpa_staged_licensees
 *
 * It NEVER touches pharmacy_premises, pharmacy_premises_licensees, GDP tables,
 * alerts or geocode evidence. Canonical mutation happens only later, inside
 * promote_vpa_import_run(), which an administrator invokes separately.
 *
 * Emits SQL to stdout by default (review it, then apply deliberately).
 * Nothing is executed against any database by this script.
 *
 * Usage:
 *   node scripts/load-vpa-staging-run.mjs \
 *     --dry-run   <dry-run report json> \
 *     --ledger    <FINAL-decision-ledger.json> \
 *     --geocode   <geocode_results.json> [--geocode <topup.json> ...] \
 *     --eligible  <eligible_new_with_coords.json> \
 *     --triggered-by <admin auth.users uuid> \
 *     [--out staging.sql]
 *
 * DISPOSITION MAPPING (this is the reviewable design decision)
 * -----------------------------------------------------------
 * promote_vpa_import_run() treats a staged row as BLOCKING when:
 *   disposition IN (ambiguous_match, relocation_candidate,
 *                   duplicate_source_record, quarantined)
 *   OR review_status = 'review_required'
 *   OR (disposition = 'unmatched_new_premises'
 *       AND (NOT promotion_approved OR geocode_state NOT IN ('validated','existing')))
 *
 * It UPDATES canonical rows for disposition IN
 *   (exact_match, high_confidence_match, manually_confirmed_match)
 * and CREATES canonical rows for
 *   (unmatched_new_premises AND promotion_approved).
 *
 * Therefore the ledger maps as:
 *
 *   ledger basis                     -> staged disposition        effect
 *   auto_exact_match                 -> exact_match               UPDATE
 *   auto_high_confidence_match       -> high_confidence_match     UPDATE
 *   bulk_approved / investigation_   -> manually_confirmed_match  UPDATE
 *     resolved / user_decision
 *   NEW + geocode-eligible           -> unmatched_new_premises    CREATE
 *                                       (promotion_approved=true,
 *                                        geocode_state='validated')
 *   NEW + held for geocode review    -> rejected_match            NO ACTION
 *   excluded (Aspendale closed row)  -> rejected_match            NO ACTION
 *
 * `rejected_match` is used for held and excluded rows because it is the only
 * disposition in the table CHECK constraint that is simultaneously non-blocking
 * and not acted upon. It does NOT mean the record was judged invalid: the real
 * reason is written verbatim into review_note, and every source row is still
 * retained in pharmacy_vpa_raw_source_rows as complete evidence. Reviewers
 * should confirm they are comfortable with that overloading.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

function argAll(flag) {
  const out = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}
const arg = (flag) => argAll(flag)[0];

const dryRunPath = arg("--dry-run");
const ledgerPath = arg("--ledger");
const eligiblePath = arg("--eligible");
const geocodePaths = argAll("--geocode");
const triggeredBy = arg("--triggered-by");
const outPath = arg("--out");

if (!dryRunPath || !ledgerPath || !eligiblePath || !triggeredBy) {
  console.error(
    "Required: --dry-run <json> --ledger <json> --eligible <json> --triggered-by <uuid> [--geocode <json>]...",
  );
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(triggeredBy)) {
  console.error("--triggered-by must be a uuid (an administrator's auth.users id)");
  process.exit(1);
}

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const report = await readJson(dryRunPath);
const ledger = await readJson(ledgerPath);
const eligible = new Set(await readJson(eligiblePath));

const geocode = new Map();
for (const p of geocodePaths) {
  for (const row of await readJson(p)) geocode.set(row.source_key, row);
}

const q = (v) => {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replaceAll("'", "''")}'`;
};
const num = (v) => (v === null || v === undefined || v === "" ? "NULL" : Number(v));
const bool = (v) => (v ? "true" : "false");
const jsonLit = (v) => `${q(JSON.stringify(v ?? []))}::jsonb`;
const uuidArray = (ids) =>
  ids && ids.length
    ? `ARRAY[${ids.map((i) => `${q(i)}::uuid`).join(",")}]::uuid[]`
    : `'{}'::uuid[]`;

// ---------------------------------------------------------------- decisions
const decision = new Map();
for (const row of ledger.link) decision.set(row.source_key, { kind: "link", ...row });
for (const row of ledger.new) decision.set(row.source_key, { kind: "new", ...row });
for (const row of ledger.excluded) decision.set(row.source_key, { kind: "excluded", ...row });

const DISPOSITION_BY_BASIS = {
  auto_exact_match: "exact_match",
  auto_high_confidence_match: "high_confidence_match",
  bulk_approved: "manually_confirmed_match",
  investigation_resolved: "manually_confirmed_match",
  user_decision: "manually_confirmed_match",
  collision_resolution_confirmed: "manually_confirmed_match",
};

// Run id is derived from the ledger so re-running the loader for the same
// approved decisions cannot silently create a second staging run.
const RUN = createHash("sha256")
  .update(`${ledger.source_file_sha256}:${ledger.built_at}`)
  .digest("hex");
const runUuid = [
  RUN.slice(0, 8),
  RUN.slice(8, 12),
  `4${RUN.slice(13, 16)}`,
  `8${RUN.slice(17, 20)}`,
  RUN.slice(20, 32),
].join("-");

const src = report.source ?? {};
const staged = report.staged ?? [];

const lines = [];
lines.push("-- VPA staging load. Generated by scripts/load-vpa-staging-run.mjs.");
lines.push("-- Writes ONLY to private VPA staging tables. No canonical pharmacy row is");
lines.push("-- inserted, updated or deleted here. Promotion is a separate, explicit step.");
lines.push(`-- ledger built_at        : ${ledger.built_at}`);
lines.push(`-- source csv sha256      : ${ledger.source_file_sha256}`);
lines.push(`-- matcher version        : ${ledger.algorithm_version}`);
lines.push(`-- run id                 : ${runUuid}`);
lines.push("");
lines.push("BEGIN;");
lines.push("");
lines.push("-- Refuse to run twice for the same ledger.");
lines.push("DO $$ BEGIN");
lines.push(
  `  IF EXISTS (SELECT 1 FROM public.pharmacy_vpa_runs WHERE id = ${q(runUuid)}::uuid) THEN`,
);
lines.push(`    RAISE EXCEPTION 'staging run % already exists', ${q(runUuid)};`);
lines.push("  END IF;");
lines.push("END $$;");
lines.push("");

const counts = {
  link: 0,
  create: 0,
  held: 0,
  excluded: 0,
  licensees: 0,
  rawRows: 0,
};

lines.push("INSERT INTO public.pharmacy_vpa_runs (");
lines.push("  id, status, triggered_by, source_file_name, source_file_hash,");
lines.push("  source_reference_date, source_scraped_at, source_row_count,");
lines.push("  premises_count, licensee_count, parser_error_count,");
lines.push("  validation_error_count, cap_warning_count, imported_at");
lines.push(") VALUES (");
lines.push(
  `  ${q(runUuid)}::uuid, 'validated', ${q(triggeredBy)}::uuid, ${q(src.file_name)}, ${q(src.sha256)},`,
);
const refDate = staged[0]?.source?.scraped_at ? staged[0].source.scraped_at.slice(0, 10) : null;
lines.push(
  `  ${q(refDate)}::date, ${q(staged[0]?.source?.scraped_at)}::timestamptz, ${staged.reduce((n, p) => n + (p.source.source_rows?.length ?? 0), 0)},`,
);
lines.push(
  `  ${staged.length}, ${staged.reduce((n, p) => n + (p.source.licensees?.length ?? 0), 0)}, 0,`,
);
lines.push("  0, 0, now()");
lines.push(");");
lines.push("");

// -------------------------------------------------------- raw source rows
lines.push("-- Complete raw source evidence. Every CSV row is retained, including rows");
lines.push("-- whose premises produces no canonical action in this run.");
let rowNumber = 0;
for (const premises of staged) {
  for (const raw of premises.source.source_rows ?? []) {
    rowNumber += 1;
    const fingerprint = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
    lines.push(
      `INSERT INTO public.pharmacy_vpa_raw_source_rows (run_id, source_row_number, source_row_fingerprint, source_payload, parse_status) VALUES (${q(runUuid)}::uuid, ${rowNumber}, ${q(fingerprint)}, ${q(JSON.stringify(raw))}::jsonb, 'parsed');`,
    );
    counts.rawRows += 1;
  }
}
lines.push("");

// ----------------------------------------------------------- staged rows
for (const premises of staged) {
  const s = premises.source;
  const m = premises.match;
  const d = decision.get(s.source_key);
  if (!d) throw new Error(`ledger has no decision for source_key: ${s.source_key}`);

  const stagedId = createHash("sha256").update(`${runUuid}:${s.source_key}`).digest("hex");
  const stagedUuid = [
    stagedId.slice(0, 8),
    stagedId.slice(8, 12),
    `4${stagedId.slice(13, 16)}`,
    `8${stagedId.slice(17, 20)}`,
    stagedId.slice(20, 32),
  ].join("-");

  let disposition;
  let reviewStatus;
  let reviewNote;
  let promotionApproved = false;
  let geocodeState = "not_required";
  let lat = null;
  let lng = null;
  let canonicalId = null;

  if (d.kind === "link") {
    disposition = DISPOSITION_BY_BASIS[d.basis];
    if (!disposition) throw new Error(`unmapped ledger basis: ${d.basis}`);
    reviewStatus = "approved";
    reviewNote = `LINK approved (${d.basis}).`;
    geocodeState = "existing";
    canonicalId = d.canonical_premises_id;
  } else if (d.kind === "new" && eligible.has(s.source_key)) {
    const g = geocode.get(s.source_key);
    if (!g || !g.vicmap_pfi || g.lat == null || g.lng == null) {
      throw new Error(`eligible NEW without validated geocode: ${s.source_key}`);
    }
    disposition = "unmatched_new_premises";
    reviewStatus = "approved";
    promotionApproved = true;
    geocodeState = "validated";
    lat = g.lat;
    lng = g.lng;
    reviewNote = `NEW approved. Vicmap PFI ${g.vicmap_pfi} (${g.match_method}); returned address ${g.returned_address}.`;
    counts.create += 1;
  } else if (d.kind === "new") {
    const g = geocode.get(s.source_key) ?? {};
    disposition = "rejected_match";
    reviewStatus = "held_for_geocode_review";
    reviewNote = `NEW disposition approved but held from this run: geocode ${g.state ?? "unresolved"} (${g.reasons || "no defensible single address point"}). No canonical row is created. Not a rejection of the premises.`;
    counts.held += 1;
  } else {
    disposition = "rejected_match";
    reviewStatus = "historical_evidence_no_action";
    reviewNote = d.reason;
    counts.excluded += 1;
  }
  if (d.kind === "link") counts.link += 1;

  lines.push(
    `INSERT INTO public.pharmacy_vpa_staged_premises (
  id, run_id, source_record_key, source_row_fingerprint, official_name,
  street_address, suburb, state, postcode, full_address,
  registration_status_raw, registration_status_normalised, registered_until,
  premises_conditions_raw, source_url, source_scraped_at, disposition,
  proposed_canonical_premises_id, match_score, match_factors, match_conflicts,
  candidate_ids, algorithm_version, review_status, reviewed_by, reviewed_at,
  review_note, geocode_state, proposed_lat, proposed_lng, promotion_approved
) VALUES (
  ${q(stagedUuid)}::uuid, ${q(runUuid)}::uuid, ${q(s.source_key)},
  ${q(createHash("sha256").update(JSON.stringify(s)).digest("hex"))},
  ${q(s.premises_name)}, ${q(s.street_address)}, ${q(s.suburb)}, ${q(s.state ?? "VIC")},
  ${q(s.postcode)}, ${q(s.full_address)}, ${q(s.registration_status)},
  ${q(normaliseStatus(s.registration_status))}, ${toDate(s.registered_until)},
  ${q(s.premises_conditions)}, ${q(s.source_url)}, ${q(s.scraped_at)}::timestamptz,
  ${q(disposition)}, ${canonicalId ? `${q(canonicalId)}::uuid` : "NULL"},
  ${num(m.score)}, ${jsonLit(m.factors)}, ${jsonLit(m.conflicts)},
  ${uuidArray(m.candidate_ids)}, ${q(m.algorithm_version)}, ${q(reviewStatus)},
  ${q(triggeredBy)}::uuid, now(), ${q(reviewNote)},
  ${q(geocodeState)}, ${num(lat)}, ${num(lng)}, ${bool(promotionApproved)}
);`,
  );

  for (const licensee of s.licensees ?? []) {
    counts.licensees += 1;
    lines.push(
      `INSERT INTO public.pharmacy_vpa_staged_licensees (run_id, staged_premises_id, source_row_fingerprint, published_name, licence_status_raw, licensed_until, licence_conditions_raw, currently_observed, review_status) VALUES (${q(runUuid)}::uuid, ${q(stagedUuid)}::uuid, ${q(createHash("sha256").update(`${s.source_key}:${licensee.name}`).digest("hex"))}, ${q(licensee.name)}, ${q(licensee.status)}, ${toDate(licensee.licensed_until)}, ${q(licensee.conditions)}, ${bool((licensee.status ?? "").toLowerCase() !== "inactive")}, 'approved') ON CONFLICT (run_id, staged_premises_id, published_name) DO NOTHING;`,
    );
  }
}

lines.push("");
lines.push("-- Fail loudly rather than stage a run that promotion would reject.");
lines.push("DO $$");
lines.push("DECLARE blocking integer;");
lines.push("BEGIN");
lines.push("  SELECT count(*) INTO blocking FROM public.pharmacy_vpa_staged_premises");
lines.push(`  WHERE run_id = ${q(runUuid)}::uuid AND (`);
lines.push(
  "    disposition IN ('ambiguous_match','relocation_candidate','duplicate_source_record','quarantined')",
);
lines.push("    OR review_status = 'review_required'");
lines.push(
  "    OR (disposition = 'unmatched_new_premises' AND (NOT promotion_approved OR geocode_state NOT IN ('validated','existing')))",
);
lines.push("  );");
lines.push("  IF blocking > 0 THEN");
lines.push("    RAISE EXCEPTION 'staged run still has % blocking rows', blocking;");
lines.push("  END IF;");
lines.push("END $$;");
lines.push("");
lines.push("COMMIT;");
lines.push("");
lines.push(`-- staged premises        : ${staged.length}`);
lines.push(`-- LINK (update canonical): ${counts.link}`);
lines.push(`-- NEW  (create canonical): ${counts.create}`);
lines.push(`-- held for geocode      : ${counts.held}`);
lines.push(`-- excluded, no action    : ${counts.excluded}`);
lines.push(`-- staged licensee rows   : ${counts.licensees}`);
lines.push(`-- raw source rows        : ${counts.rawRows}`);
lines.push("--");
lines.push("-- Promotion is a separate administrator action:");
lines.push(`--   SELECT public.promote_vpa_import_run('${runUuid}');`);

function normaliseStatus(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "active") return "active";
  if (v === "closed") return "closed";
  if (v === "inactive") return "inactive";
  if (v === "suspended") return "suspended";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  return "unknown";
}
function toDate(v) {
  if (!v) return "NULL";
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v).trim());
  if (m) return `'${m[3]}-${m[2]}-${m[1]}'::date`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim());
  return iso ? `'${iso[1]}'::date` : "NULL";
}

const sql = lines.join("\n");
if (outPath) {
  await writeFile(outPath, sql, { mode: 0o600 });
  console.error(`wrote ${outPath}`);
} else {
  process.stdout.write(sql);
}
console.error(
  `run ${runUuid} | staged ${staged.length} | link ${counts.link} | create ${counts.create} | held ${counts.held} | excluded ${counts.excluded} | licensees ${counts.licensees} | raw ${counts.rawRows}`,
);
