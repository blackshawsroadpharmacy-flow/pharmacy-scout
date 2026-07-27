import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("map and list receive the same viewport-scoped pharmacy collection", async () => {
  const source = await readFile(
    new URL("../src/components/map/map-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const all = useMemo\(\(\) => pharmacyResult\?\.items/);
  assert.match(source, /<MapView[\s\S]*?premises=\{filtered\}/);
  assert.match(source, /<LeftPanel[\s\S]*?premises=\{all\}[\s\S]*?filtered=\{filtered\}/);
  assert.doesNotMatch(source, /fetchAllPremises/);
});

test("dossier loading is selected-record scoped", async () => {
  const [source, dossier] = await Promise.all([
    readFile(new URL("../src/lib/premises-public.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/map/right-dossier.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /\.eq\("id", id\)\s*\.maybeSingle\(\)/);
  assert.match(dossier, /queryKey: \["pharmacy-dossier", premisesId\]/);
  assert.doesNotMatch(dossier, /allPremises/);
  assert.doesNotMatch(source, /haversine/i);
});

test("Leaflet movement is debounced before viewport state changes", async () => {
  const source = await readFile(
    new URL("../src/components/map/map-view.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /window\.clearTimeout\(timer\.current\)/);
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /}, 250\)/);
});
