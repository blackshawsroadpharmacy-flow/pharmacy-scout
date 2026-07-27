import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const topBar = await readFile(
  new URL("../src/components/map/top-bar.tsx", import.meta.url),
  "utf8",
);
const mapScreen = await readFile(
  new URL("../src/components/map/map-screen.tsx", import.meta.url),
  "utf8",
);
const searchClient = await readFile(
  new URL("../src/lib/statewide-search.ts", import.meta.url),
  "utf8",
);
const about = await readFile(new URL("../src/routes/about.tsx", import.meta.url), "utf8");
const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");

test("statewide search is bounded, debounced, cancellable and keyboard accessible", () => {
  assert.match(searchClient, /STATEWIDE_SEARCH_LIMIT = 24/);
  assert.match(searchClient, /length > 120/);
  assert.match(searchClient, /\.abortSignal\(signal\)/);
  assert.match(topBar, /220/);
  assert.match(topBar, /event\.key === "\/"/);
  assert.match(topBar, /event\.key === "ArrowDown"/);
  assert.match(topBar, /event\.key === "ArrowUp"/);
  assert.match(topBar, /event\.key === "Escape"/);
  assert.match(topBar, /role="combobox"/);
  assert.match(topBar, /role="listbox"/);
  assert.match(topBar, /No results found anywhere in Victoria/);
});

test("search results are grouped and explicit result selection owns navigation", () => {
  for (const label of ["Pharmacies", "Supermarkets", "Medical centres", "Your private records"]) {
    assert.match(topBar, new RegExp(label));
  }
  assert.match(mapScreen, /handleStatewideSearchResult/);
  assert.match(mapScreen, /showPremisesOnMap\(result\.result_id/);
  assert.match(mapScreen, /setSelectedExternal\(\{ category, id: result\.result_id \}\)/);
  assert.match(mapScreen, /navigate\(\{ to: "\/app\/acquisitions" \}\)/);
  assert.match(mapScreen, /onSelect=\{openPremises\}/);
  assert.doesNotMatch(mapScreen, /function openPremises[\s\S]{0,180}setFlyTo/);
});

test("build identity exposes safe deployment fields without keys", () => {
  for (const label of [
    "Git commit",
    "Build date",
    "Environment",
    "Supabase project",
    "Latest pharmacy import",
    "Latest supermarket import",
    "Latest medical-centre import",
    "ABS reference period",
    "Schema version",
  ]) {
    assert.match(about, new RegExp(label));
  }
  assert.match(viteConfig, /VITE_BUILD_COMMIT_SHA/);
  assert.match(viteConfig, /VITE_BUILD_DATE/);
  assert.match(viteConfig, /VITE_BUILD_ENVIRONMENT/);
  assert.doesNotMatch(about, /PUBLISHABLE_KEY|SERVICE_ROLE|SUPABASE_URL/);
});
