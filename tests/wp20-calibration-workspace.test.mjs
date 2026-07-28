import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260729094000_calibration_workspace.sql", import.meta.url),
  "utf8",
);
const route = await readFile(new URL("../src/routes/app.calibration.tsx", import.meta.url), "utf8");
const library = await readFile(
  new URL("../src/lib/calibration-workspace.ts", import.meta.url),
  "utf8",
);

test("calibration workspace is organisation-private and never seeded", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /public\.is_org_member/);
  assert.doesNotMatch(migration, /INSERT INTO public\.dispensing_calibration_observations/);
  assert.doesNotMatch(library, /example observation|sample pharmacy/i);
});

test("manual and CSV evidence retain definitions, periods and provenance", () => {
  for (const value of [
    "evidence_period_start",
    "evidence_period_end",
    "includes_private_prescriptions",
    "includes_under_copayment",
    "includes_daa_volume",
    "includes_institutional_supply",
    "inclusion_notes",
    "exclusion_notes",
    "source_type",
    "source",
    "confidence",
  ]) {
    assert.match(library, new RegExp(value));
  }
  assert.match(route, /Download blank CSV template/);
  assert.match(route, /quarantined/);
});

test("readiness remains truthful and fitting is disabled below ten pharmacies", () => {
  assert.match(route, /uniquePharmacies < 10/);
  assert.match(route, /Predictive fitting is disabled/);
  assert.match(route, /No predictive\s+accuracy is claimed/);
  assert.match(route, /Zero genuine observations/);
});

test("overlap, inconsistency and review warnings are implemented", () => {
  assert.match(migration, /daterange/);
  assert.match(migration, /inconsistent_inclusion_count/);
  assert.match(migration, /unreviewed.*in_review.*verified.*rejected/);
  assert.match(route, /Overlaps/);
  assert.match(route, /Inclusion definitions differ/);
});

test("CSV template is blank and cannot fabricate observations", () => {
  assert.match(library, /CALIBRATION_COLUMNS\.join/);
  assert.match(library, /return `\$\{CALIBRATION_COLUMNS\.join\(","\)\}\\n`/);
  assert.doesNotMatch(library, /observed_scripts_per_day:\s*[0-9]/);
});
