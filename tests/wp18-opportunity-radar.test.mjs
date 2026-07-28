import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const radar = await readFile(new URL("../src/lib/radar.functions.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../src/routes/app.radar.tsx", import.meta.url), "utf8");
const map = await readFile(
  new URL("../src/components/map/map-screen.tsx", import.meta.url),
  "utf8",
);
const index = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");

test("radar rankings are explainable server-side screens", () => {
  assert.match(radar, /requireSupabaseAuth/);
  for (const category of [
    "highest_potential",
    "strongest_scripts_equivalent",
    "high_growth_low_supply",
    "healthcare_weak_supply",
    "low_confidence_high_potential",
    "metropolitan",
    "regional",
    "acquisition_below_potential",
  ])
    assert.match(radar, new RegExp(category));
  assert.match(radar, /principal_reason/);
  assert.match(radar, /limiting_factor/);
  assert.match(route, /Why this ranks/);
});

test("radar actions include map, comparison and private pipeline", () => {
  assert.match(route, /Open on map/);
  assert.match(route, /Compare/);
  assert.match(route, /Add to pipeline/);
  assert.match(route, /addPharmacyToPipeline/);
  assert.match(route, /Compare pharmacies, candidates and acquisitions/);
});

test("public map deep links allow only public viewport, layers and filters", () => {
  for (const field of ["lat", "lng", "z", "layers", "potential"]) {
    assert.match(index, new RegExp(field));
  }
  assert.doesNotMatch(index, /notes|asking_price|opportunity_id|organisation_id/);
  assert.match(map, /window\.history\.replaceState/);
});

test("morning brief is truthful about freshness, changes and deployment", () => {
  assert.match(radar, /stale_sources/);
  assert.match(radar, /changedScenarios/);
  assert.match(radar, /deployment_commit/);
  assert.match(route, /No change is asserted where no historical assessment baseline exists/);
});
