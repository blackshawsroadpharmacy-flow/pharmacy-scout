import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260729143000_official_abs_demographic_enrichment.sql",
  "utf8",
);
const importer = readFileSync("scripts/import-abs-demographics.mjs", "utf8");
const docs = readFileSync("docs/wp21-official-demographics.md", "utf8");
const map = readFileSync("src/components/map/map-screen.tsx", "utf8");
const dossier = readFileSync("src/components/map/right-dossier.tsx", "utf8");
const candidate = readFileSync("src/components/map/candidate-analysis-panel.tsx", "utf8");
const radar = readFileSync("src/lib/radar.functions.ts", "utf8");

test("WP21 preserves exact official ABS source identity and reproducibility", () => {
  assert.match(importer, /2021_GCP_SA2_for_VIC_short-header\.zip/);
  assert.match(importer, /Statistical%20Area%20Level%202%2C%20Indexes%2C%20SEIFA%202021\.xlsx/);
  assert.match(migration, /Creative Commons Attribution 4\.0 International/);
  assert.match(migration, /ASGS Edition 3/);
  assert.match(migration, /a437c5fd3c3210c41052e9ff08ecbd54170c8476ef921b197cdcb1d6e9e5e0a3/);
  assert.match(migration, /372124bbf1044e03216f87188f98b82d39a5a03a5138ed05e8f222abf8faf4f0/);
});

test("WP21 does not coerce suppressed or missing values to zero", () => {
  assert.match(importer, /return null/);
  assert.doesNotMatch(importer, /\?\?\s*0/);
  assert.match(docs, /never zero/i);
  assert.match(migration, /missing_reasons/);
});

test("WP21 imports the official available subset for every seeded Victorian SA2", () => {
  const rows = migration.match(/^\('2\d{8}',/gm) ?? [];
  assert.equal(rows.length, 522);
  for (const field of [
    "age_65_plus_count",
    "age_75_plus_count",
    "under_five_count",
    "need_assistance_count",
    "no_vehicle_dwellings_count",
    "seifa_irsd_score",
  ]) {
    assert.match(migration, new RegExp(field));
  }
});

test("spatial assignment and viewport processing remain server-side", () => {
  assert.match(migration, /ST_Covers/);
  assert.match(migration, /ST_MakeEnvelope/);
  assert.match(migration, /ST_SimplifyPreserveTopology/);
  assert.match(migration, /LIMIT 600/);
  assert.match(migration, /point-in-polygon/);
});

test("demographic evidence reaches dossiers, candidates, scenarios, map, GDP and Radar", () => {
  assert.match(dossier, /Demographics/);
  assert.match(candidate, /Official demographic context/);
  assert.match(map, /fetchDemographicViewport/);
  assert.match(migration, /official_demographic_context/);
  assert.match(migration, /official_demographics/);
  assert.match(radar, /matched ABS 2021 SA2/);
  assert.match(migration, /abs_demographic_retrieved_at/);
});

test("Census, ERP and SA2 precision caveats are explicit", () => {
  assert.match(
    docs,
    /Census usual-resident counts and Estimated Resident Population are different/,
  );
  assert.match(docs, /does not claim[\s\S]*street-level/i);
  assert.match(migration, /2021 Census count; not Estimated Resident Population/);
  assert.match(migration, /not a street-level catchment/);
});
