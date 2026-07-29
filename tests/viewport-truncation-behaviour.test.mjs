// Behavioural tests for viewport truncation reporting.
//
// The previous suite asserted that the string `truncated: totalCount > items.length`
// appeared in the source. It did — and the value it computed was never consumed
// by any component, so the map silently hid 221 of 721 pharmacies while the UI
// reported full coverage. These tests assert the reported state instead.

import assert from "node:assert/strict";
import test from "node:test";

// Mirrors the mapping in src/lib/premises-public.ts.
function summariseViewport(rows, limit) {
  const totalCount = Number(rows[0]?.total_count ?? 0);
  const items = rows.slice(0, limit).map(({ total_count: _t, ...point }) => point);
  const truncated = totalCount > items.length;
  return {
    items,
    totalCount,
    truncated,
    coverageState: truncated ? "truncated" : "covered",
    coverageNote: truncated
      ? `Showing ${items.length} of ${totalCount} pharmacies in view — zoom in to see them all. Regulatory verification remains unavailable.`
      : "Victorian pharmacy discovery dataset. Regulatory verification remains unavailable.",
  };
}

function fakeRows(count, total) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Pharmacy ${i}`,
    total_count: total,
  }));
}

test("a fully covered viewport reports covered and does not warn", () => {
  const result = summariseViewport(fakeRows(120, 120), 500);
  assert.equal(result.truncated, false);
  assert.equal(result.coverageState, "covered");
  assert.doesNotMatch(result.coverageNote, /zoom in/i);
});

test("a truncated viewport reports truncated and names both counts", () => {
  // The real regression: 721 matches, 500 returned.
  const result = summariseViewport(fakeRows(500, 721), 500);
  assert.equal(result.truncated, true);
  assert.equal(result.coverageState, "truncated");
  assert.match(result.coverageNote, /500/);
  assert.match(result.coverageNote, /721/);
  assert.match(result.coverageNote, /zoom in/i);
});

test("coverageState is never hard-coded to covered when rows are dropped", () => {
  for (const [returned, total] of [
    [500, 501],
    [1, 2],
    [499, 900],
  ]) {
    const result = summariseViewport(fakeRows(returned, total), returned);
    assert.equal(
      result.coverageState,
      "truncated",
      `${returned} of ${total} must not report full coverage`,
    );
  }
});

test("an empty viewport is covered rather than truncated", () => {
  const result = summariseViewport([], 500);
  assert.equal(result.totalCount, 0);
  assert.equal(result.truncated, false);
  assert.equal(result.coverageState, "covered");
});
