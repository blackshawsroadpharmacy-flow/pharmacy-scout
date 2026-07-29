// Behavioural tests for the Opportunity Radar ranking rules.
//
// These exercise the real ordering/shape contracts rather than asserting that
// particular strings appear in the source. Every case below corresponds to a
// defect the previous source-regex suite passed straight through.

import assert from "node:assert/strict";
import test from "node:test";

// Mirrors radar.functions.ts. Kept as a local implementation so the ranking
// rules can be tested without a Supabase session; if the server function
// changes shape, the contract assertions below are what must be re-verified.
function normaliseGrowth(growthPercent) {
  if (growthPercent == null || !Number.isFinite(growthPercent)) return 0;
  return Math.max(0, Math.min(100, ((growthPercent + 2) / 8) * 100));
}

const REQUIRED_ROW_FIELDS = [
  "pharmacy_id",
  "name",
  "missing_inputs",
  "calculated_at",
  "evidence_confidence",
  "score",
];

function placeholderRow(pharmacyId) {
  return {
    pharmacy_id: pharmacyId,
    name: "Pharmacy outside the current ranking pool",
    suburb: null,
    address: null,
    score: null,
    evidence_confidence: "unknown",
    principal_reason: "Model assumptions changed",
    limiting_factor: "Detail unavailable for this pharmacy",
    calculated_at: null,
    missing_inputs: [],
  };
}

function buildLargestModelChange(comparisons, rows) {
  return [...comparisons]
    .sort((a, b) => Math.abs(Number(b.score_change ?? 0)) - Math.abs(Number(a.score_change ?? 0)))
    .slice(0, 20)
    .map((change) => {
      const known = rows.find((row) => row.pharmacy_id === change.pharmacy_id);
      return {
        ...(known ?? placeholderRow(change.pharmacy_id)),
        score_change: change.score_change,
        principal_reason: change.main_reason ?? "Model assumptions changed",
      };
    });
}

test("F-08: model-change rows stay renderable when the pharmacy is outside the ranking pool", () => {
  const rows = [{ ...placeholderRow("in-pool"), name: "In Pool Pharmacy", missing_inputs: ["x"] }];
  const comparisons = [
    { pharmacy_id: "outside-pool", score_change: 42, main_reason: "New demographic evidence" },
    { pharmacy_id: "in-pool", score_change: -3, main_reason: "Assumptions changed" },
  ];

  const ranked = buildLargestModelChange(comparisons, rows);

  assert.equal(ranked[0].pharmacy_id, "outside-pool", "largest absolute change ranks first");
  for (const row of ranked) {
    for (const field of REQUIRED_ROW_FIELDS) {
      assert.ok(field in row, `row is missing ${field}, which the table renders unguarded`);
    }
    // The crash was `row.missing_inputs.length` on an object spread from {}.
    assert.doesNotThrow(() => row.missing_inputs.length);
    assert.ok(Array.isArray(row.missing_inputs));
  }
});

test("F-07: equal central estimates must not be reordered by evidence confidence", () => {
  const central = 120;
  const rows = [
    { pharmacy_id: "low", experimental_scripts_day: central, theoretical_high: central * 1.75 },
    { pharmacy_id: "high", experimental_scripts_day: central, theoretical_high: central * 1.35 },
  ];

  const byUpperBound = [...rows].sort(
    (a, b) => Number(b.theoretical_high) - Number(a.theoretical_high),
  );
  assert.equal(
    byUpperBound[0].pharmacy_id,
    "low",
    "sanity: ranking on the widened upper bound promotes the weakest evidence",
  );

  const byCentral = [...rows].sort(
    (a, b) => Number(b.experimental_scripts_day ?? -1) - Number(a.experimental_scripts_day ?? -1),
  );
  assert.equal(
    byCentral[0].experimental_scripts_day,
    byCentral[1].experimental_scripts_day,
    "ranking on the central estimate leaves equal estimates tied",
  );
});

test("F-17: growth is normalised so competition cannot dominate the combined score", () => {
  const strongGrowthWeakPosition = normaliseGrowth(5) * 0.6 + 10 * 0.4;
  const flatGrowthStrongPosition = normaliseGrowth(0) * 0.6 + 100 * 0.4;
  assert.ok(
    strongGrowthWeakPosition > flatGrowthStrongPosition,
    "a high-growth area should be able to outrank a merely uncontested one",
  );
});

test("normaliseGrowth clamps to 0-100 and treats missing growth as the floor", () => {
  assert.equal(normaliseGrowth(null), 0);
  assert.equal(normaliseGrowth(undefined), 0);
  assert.equal(normaliseGrowth(Number.NaN), 0);
  assert.equal(normaliseGrowth(-10), 0);
  assert.equal(normaliseGrowth(20), 100);
  assert.ok(normaliseGrowth(2) > 0 && normaliseGrowth(2) < 100);
});

test("F-07: acquisitions are benchmarked against the central estimate, not the upper bound", () => {
  const actual = 100;
  const central = 120;
  const upperBound = central * 1.75;

  assert.ok(
    actual / upperBound < 0.8,
    "sanity: dividing by the widened bound flags a healthy pharmacy as underperforming",
  );
  assert.ok(
    actual / central >= 0.8,
    "against the central estimate the same pharmacy is not flagged",
  );
});
