import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("pharmacy marker and list selection change dossier state without navigating the map", async () => {
  const source = await readFile(
    new URL("../src/components/map/map-screen.tsx", import.meta.url),
    "utf8",
  );

  const openPremises = source.match(/function openPremises\(id: string\) \{(?<body>[\s\S]*?)\n  \}/)
    ?.groups?.body;
  assert.ok(openPremises, "openPremises selection handler must exist");
  assert.match(openPremises, /setSelectedId\(id\)/);
  assert.doesNotMatch(openPremises, /setFlyTo|navigate|fitBounds|setView|panTo/);

  assert.match(source, /selectedId=\{selectedId\}[\s\S]*?onSelect=\{openPremises\}/);
  assert.match(source, /<LeftPanel[\s\S]*?onSelect=\{openPremises\}/);
  assert.match(source, /function closePremises\(\) \{\s*setSelectedId\(null\);\s*\}/);
});

test("only explicit show-on-map and candidate navigation set pharmacy fly targets", async () => {
  const source = await readFile(
    new URL("../src/components/map/map-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /function showPremisesOnMap\(id: string, lat: number, lng: number\) \{[\s\S]*?setFlyTo\(\{ lat, lng, zoom: 15 \}\)/,
  );
  assert.match(
    source,
    /if \(result\.result_type === "pharmacy"\) \{\s*showPremisesOnMap\(result\.result_id, result\.lat, result\.lng\)/,
  );
  assert.doesNotMatch(source, /openPremises\(id,\s*hit\?\.(?:lat|lng)/);
});

test("the Leaflet container is not keyed or derived from dossier selection", async () => {
  const [screen, map] = await Promise.all([
    readFile(new URL("../src/components/map/map-screen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/map/map-view.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(screen, /<MapView[^>]*key=/);
  assert.doesNotMatch(map, /<MapContainer[^>]*key=/);
  assert.match(map, /center=\{VIC_CENTRE\}/);
  assert.match(map, /zoom=\{VIC_ZOOM\}/);
});
