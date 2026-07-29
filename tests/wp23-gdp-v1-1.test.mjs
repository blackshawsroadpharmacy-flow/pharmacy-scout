import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260729200000_geographic_dispensing_potential_v1_1.sql",
  "utf8",
);
const dossier = readFileSync("src/components/map/right-dossier.tsx", "utf8");
const radar = readFileSync("src/lib/radar.functions.ts", "utf8");

test("v1.1 preserves v1.0 and records versioned assumptions", () => {
  assert.match(migration, /gdp-v1\.0\.0/);
  assert.match(migration, /gdp-v1\.1\.0/);
  assert.match(migration, /dispensing_potential_assumptions/);
  for (const field of ["rationale", "implemented_at", "implemented_by"]) {
    assert.match(migration, new RegExp(field));
  }
});

test("confidence widens uncertainty without inflating potential", () => {
  assert.match(migration, /uncertainty_multipliers/);
  assert.match(migration, /low_confidence_widening/);
  assert.match(migration, /experimental_scripts_day_equivalent\*0\.35/);
  assert.doesNotMatch(migration, /new_score\s*\*\s*confidence_score/i);
});

test("v1.1 stays assumption-based below the genuine evidence threshold", () => {
  assert.match(migration, /minimum_calibration_observations[\s\S]*10/);
  assert.match(migration, /fitting":"disabled below 10 genuine pharmacies/);
  assert.match(migration, /not validated for predictive accuracy/);
  assert.doesNotMatch(migration, /INSERT INTO public\.dispensing_calibration_observations/i);
});

test("pharmacy dossier exposes the old/new comparison", () => {
  assert.match(dossier, /Compare model versions/);
  assert.match(dossier, /old_version/);
  assert.match(dossier, /new_version/);
  assert.match(migration, /dispensing_potential_model_comparison/);
});

test("Radar includes evidence-aware v1.1 rankings", () => {
  for (const mode of [
    "ageing_population_demand",
    "aged_care_anchors",
    "healthcare_demand",
    "high_confidence_strong_potential",
    "low_demographic_resolution",
    "largest_model_change",
  ])
    assert.match(radar, new RegExp(mode));
});
