import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("population layers are sourced, independently selectable, and mutually exclusive", async () => {
  const [menu, screen] = await Promise.all([
    readFile(new URL("../src/components/map/layer-menu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/map/map-screen.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(menu, /populationDensity[\s\S]*dataSource: "ABS SA2 Regional Population 2024"/);
  assert.match(menu, /populationGrowth[\s\S]*dataSource: "ABS SA2 Regional Population 2024"/);
  assert.match(screen, /next\.populationDensity[\s\S]*next\.populationGrowth = false/);
  assert.match(screen, /next\.populationGrowth[\s\S]*next\.populationDensity = false/);
});

test("unknown population values remain unknown rather than becoming zero", async () => {
  const map = await readFile(
    new URL("../src/components/map/map-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(map, /value == null\s*\?\s*"No source coverage for this metric"/);
  assert.doesNotMatch(map, /value \?\? 0/);
  assert.doesNotMatch(map, /pop_yr2 \?\? 0/);
  assert.doesNotMatch(map, /chg_yr_to_yr_no \?\? 0/);
});
