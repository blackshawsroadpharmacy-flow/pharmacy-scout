import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260728223000_saved_greenfield_relocation_scenarios.sql",
    import.meta.url,
  ),
  "utf8",
);
const server = await readFile(
  new URL("../src/lib/scenarios.functions.ts", import.meta.url),
  "utf8",
);
const route = await readFile(new URL("../src/routes/app.scenarios.tsx", import.meta.url), "utf8");

test("greenfield and relocation are separate persistent models", () => {
  assert.match(migration, /CREATE TABLE public\.greenfield_scenarios/);
  assert.match(migration, /ALTER TABLE public\.relocation_scenarios/);
  assert.match(migration, /CREATE TABLE public\.greenfield_assessments/);
  assert.match(migration, /CREATE TABLE public\.relocation_assessments/);
});
test("assessment evidence is immutable and recalculation appends versions", () => {
  assert.match(migration, /Assessment evidence snapshots are immutable/);
  assert.match(server, /sequence_number.*\?\? 0/s);
  assert.match(server, /change_summary/);
  assert.doesNotMatch(server, /from\("greenfield_assessments"\)\.update/);
});
test("relocation requires origin and destination with server evidence", () => {
  assert.match(server, /origin_pharmacy_id: z\.string\(\)\.uuid/);
  assert.match(server, /scenario_origin_pharmacy/);
  assert.match(server, /origin_to_destination_distance_m/);
  for (const term of ["pharmacies", "medical_centres", "supermarkets"])
    assert.match(server, new RegExp(term));
  assert.match(server, /Professional public-door measurement required/);
  assert.match(server, /not a Pharmacy Location Rule conclusion/);
});
test("private scenario URL, comparison and unknown-value rules are explicit", () => {
  assert.doesNotMatch(route, /URLSearchParams|scenario=.*id/);
  assert.match(route, /c\.length < 4/);
  assert.match(route, /Unknown values remain unknown and are never converted to zero/);
  assert.match(route, /Print/);
  assert.match(route, /CSV/);
});
