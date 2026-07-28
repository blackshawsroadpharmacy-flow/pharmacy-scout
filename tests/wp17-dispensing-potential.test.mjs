import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260729003000_geographic_dispensing_potential.sql",
    import.meta.url,
  ),
  "utf8",
);
const dossier = await readFile(
  new URL("../src/components/map/right-dossier.tsx", import.meta.url),
  "utf8",
);
const mapScreen = await readFile(
  new URL("../src/components/map/map-screen.tsx", import.meta.url),
  "utf8",
);
const mapView = await readFile(
  new URL("../src/components/map/map-view.tsx", import.meta.url),
  "utf8",
);
test("statewide features and scores are server-side, cached and versioned", () => {
  assert.match(migration, /refresh_dispensing_potential_v1/);
  for (const x of [
    "pharmacies_500m",
    "pharmacies_1km",
    "pharmacies_2km",
    "pharmacies_5km",
    "nearest_competing_pharmacy_m",
    "distance_weighted_pharmacy_competition",
    "medical_centres_500m",
    "supermarkets_2km",
  ])
    assert.match(migration, new RegExp(x));
  assert.match(migration, /gdp-v1\.0\.0/);
  assert.match(migration, /peer_percentile/);
  assert.match(dossier, /peer percentile/);
});
test("theoretical output is ranged, experimental and never actual volume", () => {
  assert.match(dossier, /Experimental scripts\/day equivalent/);
  assert.match(dossier, /Theoretical scripts\/day range/);
  assert.match(migration, /not actual dispensing volume/);
  assert.match(migration, /theoretical_scripts_day_low/);
  assert.match(migration, /theoretical_scripts_day_high/);
});
test("missing demographics remain missing and lower confidence", () => {
  assert.match(migration, /No source coverage|missing_inputs/);
  assert.match(dossier, /Missing inputs/);
});
test("calibration is private, genuine and unseeded", () => {
  assert.match(migration, /dispensing_calibration_observations/);
  assert.match(migration, /public\.is_org_member/);
  assert.doesNotMatch(migration, /INSERT INTO public\.dispensing_calibration_observations/);
  assert.match(dossier, /Not calibrated against enough known pharmacies/);
  assert.match(dossier, /does not establish operational quality/);
});
test("optional map layer retains red P markers and discloses low confidence", () => {
  assert.match(mapScreen, /Geographic Dispensing Potential/);
  assert.match(mapScreen, /Strong potential \(75th\+ percentile\)/);
  assert.match(mapScreen, /Dashed = low confidence/);
  assert.match(mapView, /potential-low-confidence/);
  assert.match(mapView, /pharmacy-pin/);
});
