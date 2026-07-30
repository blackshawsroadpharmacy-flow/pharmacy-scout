import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("../scripts/load-vpa-staging-run.mjs", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const ADMIN = "00000000-0000-4000-8000-000000000001";

function premises(key, name, overrides = {}) {
  return {
    source: {
      source_key: key,
      premises_name: name,
      street_address: "1 Test Street",
      suburb: "MELBOURNE",
      state: "VIC",
      postcode: "3000",
      full_address: "1 Test Street, MELBOURNE VIC 3000",
      registration_status: overrides.status ?? "Active",
      registered_until: "30/06/2027",
      premises_conditions: "Standard registration conditions",
      source_url: "https://pharmacy.vic.gov.au/register-search/",
      scraped_at: "2026-07-29T13:34:38.613Z",
      licensees: overrides.licensees ?? [
        {
          name: "Example Licensee",
          status: "Active",
          licensed_until: "30/06/2027",
          conditions: "",
        },
      ],
      source_rows: [{ premises_name: name, licensee_name: "Example Licensee" }],
    },
    match: {
      disposition: overrides.disposition ?? "exact_match",
      canonical_premises_id: overrides.canonicalId ?? null,
      score: 1,
      factors: ["exact_structured_address"],
      conflicts: [],
      candidate_ids: [],
      algorithm_version: "vpa-match-v1.0.0",
      review_status: "auto_accepted",
    },
  };
}

function rowFor(sql, key) {
  const at = sql.indexOf(`'${key}'`);
  if (at < 0) throw new Error(`row not found for ${key}`);
  const start = sql.lastIndexOf("INSERT INTO public.pharmacy_vpa_staged_premises", at);
  const end = sql.indexOf("\n);", at);
  return sql.slice(start, end + 3);
}

async function generate() {
  const dir = await mkdtemp(join(tmpdir(), "vpa-loader-"));
  const CANON = "11111111-1111-4111-8111-111111111111";
  const report = {
    source: { file_name: "vpa.csv", sha256: "a".repeat(64) },
    staged: [
      premises("link-auto|1|melbourne|3000", "Auto Exact", { canonicalId: CANON }),
      premises("link-manual|2|melbourne|3000", "Manual Confirmed", { canonicalId: CANON }),
      premises("new-ok|3|melbourne|3000", "New Eligible", {
        disposition: "unmatched_new_premises",
      }),
      premises("new-held|4|melbourne|3000", "New Held", { disposition: "unmatched_new_premises" }),
      premises("excluded|5|melbourne|3000", "Closed Historical", {
        disposition: "exact_match",
        status: "Closed",
        canonicalId: CANON,
      }),
    ],
  };
  const ledger = {
    built_at: "2026-07-31T00:00:00Z",
    source_file_sha256: "a".repeat(64),
    algorithm_version: "vpa-match-v1.0.0",
    link: [
      {
        source_key: "link-auto|1|melbourne|3000",
        canonical_premises_id: CANON,
        basis: "auto_exact_match",
        vpa_name: "Auto Exact",
      },
      {
        source_key: "link-manual|2|melbourne|3000",
        canonical_premises_id: CANON,
        basis: "user_decision",
        vpa_name: "Manual Confirmed",
      },
    ],
    new: [
      { source_key: "new-ok|3|melbourne|3000", basis: "unmatched_new", vpa_name: "New Eligible" },
      { source_key: "new-held|4|melbourne|3000", basis: "unmatched_new", vpa_name: "New Held" },
    ],
    excluded: [
      {
        source_key: "excluded|5|melbourne|3000",
        vpa_name: "Closed Historical",
        registration_status: "Closed",
        reason: "Premises relocated. Closure evidence retained, no closure action.",
      },
    ],
  };
  const geocode = [
    {
      source_key: "new-ok|3|melbourne|3000",
      state: "validated",
      match_method: "exact_address_point",
      vicmap_pfi: "12345678",
      returned_address: "1 TEST STREET MELBOURNE 3000",
      lat: -37.81,
      lng: 144.96,
      reasons: "",
    },
    {
      source_key: "new-held|4|melbourne|3000",
      state: "quarantined",
      match_method: "ambiguous_multiple_address_points",
      vicmap_pfi: "",
      returned_address: "",
      lat: "",
      lng: "",
      reasons: "candidate_spread_200m",
    },
  ];
  const p = (n) => join(dir, n);
  await writeFile(p("report.json"), JSON.stringify(report));
  await writeFile(p("ledger.json"), JSON.stringify(ledger));
  await writeFile(p("geocode.json"), JSON.stringify(geocode));
  await writeFile(p("eligible.json"), JSON.stringify(["new-ok|3|melbourne|3000"]));
  execFileSync(
    process.execPath,
    [
      script,
      "--dry-run",
      p("report.json"),
      "--ledger",
      p("ledger.json"),
      "--geocode",
      p("geocode.json"),
      "--eligible",
      p("eligible.json"),
      "--triggered-by",
      ADMIN,
      "--out",
      p("out.sql"),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const sql = await readFile(p("out.sql"), "utf8");
  await rm(dir, { recursive: true, force: true });
  return sql;
}

// SQL with comment lines removed: what the database would actually execute.
const executable = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

test("loader never writes to canonical or derived tables", async () => {
  const sql = executable(await generate());
  for (const forbidden of [
    "INSERT INTO public.pharmacy_premises ",
    "UPDATE public.pharmacy_premises ",
    "DELETE FROM public.pharmacy_premises",
    "INSERT INTO public.pharmacy_premises_licensees",
    "public.pharmacy_dispensing_potential",
    "public.vpa_private_alerts",
    "public.vpa_gdp_staging_comparisons",
    "promote_vpa_import_run(",
  ]) {
    assert.ok(!sql.includes(forbidden), `loader SQL must not contain: ${forbidden}`);
  }
});

test("loader writes only to the private staging tables", async () => {
  const sql = await generate();
  const targets = [...sql.matchAll(/INSERT INTO (public\.[a-z_]+)/g)].map((m) => m[1]);
  const allowed = new Set([
    "public.pharmacy_vpa_runs",
    "public.pharmacy_vpa_raw_source_rows",
    "public.pharmacy_vpa_staged_premises",
    "public.pharmacy_vpa_staged_licensees",
  ]);
  for (const t of new Set(targets)) assert.ok(allowed.has(t), `unexpected insert target: ${t}`);
});

test("ledger basis maps to the disposition promotion expects", async () => {
  const sql = await generate();
  assert.match(sql, /'link-auto\|1\|melbourne\|3000',[\s\S]{0,600}?'exact_match'/);
  assert.match(sql, /'link-manual\|2\|melbourne\|3000',[\s\S]{0,600}?'manually_confirmed_match'/);
  assert.match(sql, /'new-ok\|3\|melbourne\|3000',[\s\S]{0,600}?'unmatched_new_premises'/);
});

test("only geocode-eligible new premises are approved for creation", async () => {
  const sql = await generate();
  const eligibleRow = rowFor(sql, "new-ok|3|melbourne|3000");
  assert.match(eligibleRow, /'validated'/);
  assert.ok(eligibleRow.trimEnd().endsWith("true\n);"), "eligible row sets promotion_approved");
  assert.match(eligibleRow, /12345678/);

  const heldRow = rowFor(sql, "new-held|4|melbourne|3000");
  assert.match(heldRow, /'rejected_match'/);
  assert.match(heldRow, /held_for_geocode_review/);
  assert.ok(heldRow.trimEnd().endsWith("false\n);"), "held row is not approved for promotion");
});

test("excluded closed record is retained with no canonical action", async () => {
  const sql = await generate();
  const excludedRow = rowFor(sql, "excluded|5|melbourne|3000");
  assert.match(excludedRow, /'rejected_match'/);
  assert.match(excludedRow, /historical_evidence_no_action/);
  assert.match(excludedRow, /Closure evidence retained/);
  // the closed status is still recorded verbatim as source evidence
  assert.match(excludedRow, /'Closed'/);
  assert.match(excludedRow, /'closed'/);
});

test("every source row is retained as raw evidence", async () => {
  const sql = await generate();
  const raw = [...sql.matchAll(/INSERT INTO public\.pharmacy_vpa_raw_source_rows/g)];
  assert.equal(raw.length, 5, "one raw row per source row in the fixture");
});

test("generated SQL is transactional and guards against blocking rows", async () => {
  const sql = await generate();
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.match(sql, /RAISE EXCEPTION 'staged run still has % blocking rows'/);
  assert.match(sql, /RAISE EXCEPTION 'staging run % already exists'/);
});

test("run id is deterministic for the same ledger", async () => {
  const [a, b] = [await generate(), await generate()];
  const id = (s) => /-- run id\s+: ([0-9a-f-]+)/.exec(s)[1];
  assert.equal(id(a), id(b));
});

test("loader refuses a non-uuid administrator id", () => {
  assert.throws(() =>
    execFileSync(process.execPath, [script, "--triggered-by", "not-a-uuid"], {
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
});
