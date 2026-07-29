import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("pharmacies render as labelled red P markers while retaining evidence states", async () => {
  const source = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(source, /\.pharmacy-pin::before\s*\{\s*content: "P"/);
  assert.match(source, /\.pharmacy-pin\s*\{[\s\S]*?background: #ef1b24/);
  assert.match(source, /\.pharmacy-pin\.approximate\s*\{[\s\S]*?border-style: dashed/);
  assert.doesNotMatch(source, /\.pharmacy-pin\.(?:verified|partial|saved)\s*\{[^}]*background:/);
  assert.match(source, /\.pharmacy-pin\.verified\s*\{[\s\S]*?outline: 2px solid #0f9d8a/);
  assert.match(source, /\.pharmacy-pin\.partial\s*\{[\s\S]*?outline: 2px solid #d97706/);
  assert.match(source, /\.pharmacy-pin\.selected\s*\{[\s\S]*?width: 36px/);
  assert.match(source, /\.leaflet-marker-icon:hover \.pharmacy-pin\s*\{/);
});

test("pharmacy clusters use fixed-size red P swarms with mathematically centred counts", async () => {
  const [mapSource, styles] = await Promise.all([
    readFile(new URL("../src/components/map/map-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(mapSource, /count < 10 \? "small" : count < 50 \? "medium" : "large"/);
  assert.match(mapSource, /tier === "small" \? 3 : tier === "medium" \? 5 : 7/);
  assert.match(mapSource, /tier === "small" \? 42 : tier === "medium" \? 50 : 58/);
  assert.match(mapSource, /className: "pharmacy-cluster-icon"/);
  assert.match(mapSource, /iconAnchor: L\.point\(size \/ 2, size \/ 2\)/);
  assert.match(mapSource, /aria-label="\$\{count\} pharmacies in this area"/);
  assert.match(mapSource, /pharmacy-cluster__p[^>]+aria-hidden="true">P/);
  assert.doesNotMatch(mapSource, /className: "marker-cluster-navy"/);
  assert.match(mapSource, /iconCreateFunction=\{clusterIcon\}/);
  assert.match(mapSource, /title=\{`\$\{p\.name\} — Pharmacy`\}/);

  assert.match(
    styles,
    /\.pharmacy-cluster__count\s*\{[\s\S]*?inset: 50% auto auto 50%;[\s\S]*?transform: translate\(-50%, -50%\);/,
  );
  assert.match(styles, /\.pharmacy-cluster__p\s*\{[\s\S]*?background: #ef1b24/);
  assert.match(styles, /\.pharmacy-cluster-icon\s*\{[\s\S]*?margin: 0 !important/);
  assert.match(styles, /\.external-pin\.supermarket\s*\{[\s\S]*?background: #b45309/);
  assert.match(styles, /\.external-pin\.medical-centre\s*\{[\s\S]*?background: #0f766e/);
});
