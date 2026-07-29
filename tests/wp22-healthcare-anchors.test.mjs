import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260729180000_official_healthcare_demand_anchors.sql",
  "utf8",
);
const importer = readFileSync("scripts/import-official-aged-care.mjs", "utf8");
const map = readFileSync("src/components/map/map-screen.tsx", "utf8");
const dossier = readFileSync("src/components/map/right-dossier.tsx", "utf8");
const candidate = readFileSync("src/components/map/candidate-analysis-panel.tsx", "utf8");
const search = readFileSync("src/lib/statewide-search.ts", "utf8");
const followupMigration = readFileSync(
  "supabase/migrations/20260730090000_audit_followup_search_and_atomic_acquisitions.sql",
  "utf8",
);

test("WP22 imports authoritative aged-care anchors with complete provenance", () => {
  assert.match(migration, /Aged care service list: 30 June 2025/);
  assert.match(migration, /Creative Commons Attribution 4.0 International/);
  assert.match(migration, /87fc181bf70bf363045db7ab5f97b53aa5556cff3b3a81d20ed5da19e0638dc2/);
  assert.match(migration, /'2025-06-30'/);
  assert.match(importer, /gen-agedcaredata\.gov\.au/);
  assert.match(migration, /,745,/);
});

test("raw and canonical records are separated and preserve official precedence", () => {
  assert.match(migration, /CREATE TABLE public\.healthcare_anchor_raw/);
  assert.match(migration, /CREATE TABLE public\.healthcare_anchors/);
  assert.match(migration, /raw_id UUID NOT NULL UNIQUE/);
  assert.match(migration, /authoritative_identifier TEXT/);
  assert.match(migration, /coordinate_method/);
});

test("distances, counts and published places are server-side at required radii", () => {
  for (const token of ["500m", "1km", "2km", "5km"]) assert.match(migration, new RegExp(token));
  assert.match(migration, /ST_DWithin/);
  assert.match(migration, /approved_places_2km/);
  assert.match(migration, /weighted_healthcare_anchor_index/);
  assert.match(migration, /LIMIT 750/);
});

test("WP22 integrates map, search, dossier, candidate, scenarios and GDP evidence", () => {
  assert.match(map, /fetchHealthcareAnchors/);
  assert.match(search, /statewide_location_search/);
  assert.match(followupMigration, /FROM public\.healthcare_anchors/);
  assert.match(dossier, /Healthcare-demand anchors/);
  assert.match(candidate, /Healthcare-demand anchors/);
  assert.match(migration, /'healthcare_demand'/);
  assert.match(migration, /official_healthcare_anchor_context/);
});

test("unknown hospital coverage is not zero and capacity is never inferred", () => {
  assert.match(migration, /'hospitals_5km',NULL/);
  assert.match(migration, /approved places, not occupied beds/);
  assert.match(migration, /not guaranteed prescription volume/);
  assert.doesNotMatch(importer, /building.*size/i);
});
