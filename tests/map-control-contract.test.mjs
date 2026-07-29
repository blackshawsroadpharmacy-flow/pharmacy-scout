import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layerMenuPath = new URL("../src/components/map/layer-menu.tsx", import.meta.url);
const mapScreenPath = new URL("../src/components/map/map-screen.tsx", import.meta.url);
const leftPanelPath = new URL("../src/components/map/left-panel.tsx", import.meta.url);

test("every visible layer toggle declares a data source and changes rendered data", async () => {
  const [layerMenu, mapScreen] = await Promise.all([
    readFile(layerMenuPath, "utf8"),
    readFile(mapScreenPath, "utf8"),
  ]);

  const entries = [
    ...layerMenu.matchAll(
      /key:\s*"(?<key>[^"]+)",\s*label:\s*"(?<label>[^"]+)",\s*dataSource:\s*"(?<source>[^"]+)"/gs,
    ),
  ].map((match) => match.groups);

  assert.deepEqual(
    entries.map((entry) => entry.key),
    [
      "pharmacies",
      "supermarkets",
      "medicalCentres",
      "populationDensity",
      "populationGrowth",
      "dispensingPotential",
      "age65",
      "age75",
      "needAssistance",
      "seifaDisadvantage",
      "noVehicle",
      "agedCare",
    ],
  );
  for (const entry of entries) {
    assert.ok(entry.source, `${entry.label} must declare a data source`);
    const usesOutsideMenu = mapScreen.match(new RegExp(`layers\\.${entry.key}`, "g")) ?? [];
    assert.ok(
      usesOutsideMenu.length > 0,
      `${entry.label} must be bound to map/list data outside the menu`,
    );
  }
});

test("controls with no regulatory or private-layer coverage stay hidden", async () => {
  const [layerMenu, leftPanel, mapScreen, viewportSql, premisesClient] = await Promise.all([
    readFile(layerMenuPath, "utf8"),
    readFile(leftPanelPath, "utf8"),
    readFile(mapScreenPath, "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/20260727103000_viewport_scoped_map_results.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/lib/premises-public.ts", import.meta.url), "utf8"),
  ]);
  const visibleControls = `${layerMenu}\n${leftPanel}`;

  for (const label of [
    "Verified PBS approvals",
    "Verified VPA premises",
    "Saved acquisition targets",
    "Candidate greenfield sites",
    "Only verified VPA registration",
    "Only PBS approval known",
  ]) {
    assert.equal(
      visibleControls.includes(label),
      false,
      `${label} must not render without coverage`,
    );
  }

  assert.equal(
    mapScreen.includes("if (filters.pbsKnown) return false"),
    false,
    "PBS filtering must never be implemented as an unconditional empty result",
  );
  assert.ok(
    leftPanel.includes("Only missing contact/geocode data"),
    "the missing-data filter must name the coverage it evaluates",
  );
  assert.ok(
    viewportSql.includes("p.phone IS NULL") &&
      viewportSql.includes("p.website IS NULL") &&
      viewportSql.includes("p.geocode_method = 'suburb_centroid'") &&
      premisesClient.includes("p_missing_data: filters.missingData"),
    "the missing-data filter must be bound to contact and geocode coverage",
  );
});
