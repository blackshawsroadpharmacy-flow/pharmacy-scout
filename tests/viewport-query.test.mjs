import test from "node:test";
import assert from "node:assert/strict";
import {
  ViewportRequestCoordinator,
  isCurrentViewportResult,
  normalizeViewportBounds,
  viewportRequestKey,
} from "../src/lib/viewport-query.mjs";

const melbourne = { west: 144.8, south: -38, east: 145.1, north: -37.7 };

test("viewport bounds are clipped, validated, and canonicalised", () => {
  assert.deepEqual(normalizeViewportBounds({ west: 140, south: -40, east: 151, north: -33 }), {
    west: 140.9,
    south: -39.2,
    east: 150,
    north: -33.9,
  });
  assert.equal(normalizeViewportBounds({ west: 145, south: -37.7, east: 144, north: -38 }), null);
  assert.deepEqual(
    normalizeViewportBounds({ west: 144.8000001, south: -38, east: 145.1, north: -37.7 }),
    melbourne,
  );
});

test("identical bounds and filters produce one stable request key", () => {
  const first = viewportRequestKey("pharmacies", melbourne, {
    metroOnly: false,
    missingData: true,
  });
  const reordered = viewportRequestKey(
    "pharmacies",
    { ...melbourne },
    {
      missingData: true,
      metroOnly: false,
    },
  );
  assert.equal(first, reordered);
  assert.notEqual(
    first,
    viewportRequestKey("pharmacies", melbourne, { missingData: false, metroOnly: false }),
  );
});

test("duplicate in-flight viewport requests share one execution", async () => {
  const coordinator = new ViewportRequestCoordinator();
  let executions = 0;
  let release;
  const executor = () => {
    executions += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = coordinator.request("same", executor);
  const duplicate = coordinator.request("same", executor);
  assert.equal(first, duplicate);
  assert.equal(executions, 0);
  await Promise.resolve();
  assert.equal(executions, 1);
  release("done");
  assert.equal(await duplicate, "done");
});

test("new viewport cancels stale work and stale results cannot win", async () => {
  const coordinator = new ViewportRequestCoordinator();
  let oldSignal;
  let resolveOld;
  const old = coordinator.request("old", (signal) => {
    oldSignal = signal;
    return new Promise((resolve) => {
      resolveOld = resolve;
    });
  });
  await Promise.resolve();
  const current = coordinator.request("current", async () => "current result");
  assert.equal(oldSignal.aborted, true);
  resolveOld("old result");
  await assert.rejects(old, (error) => error.name === "AbortError");
  assert.equal(await current, "current result");
});

test("map/list consumers reject a response for an older request key", () => {
  assert.equal(isCurrentViewportResult("new", { requestKey: "old", items: [1] }), false);
  assert.equal(isCurrentViewportResult("new", { requestKey: "new", items: [1] }), true);
});
