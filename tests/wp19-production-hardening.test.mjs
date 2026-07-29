import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const buildRoute = await readFile(
  new URL("../src/routes/build[.]json.ts", import.meta.url),
  "utf8",
);
const verifier = await readFile(
  new URL("../scripts/verify-production.mjs", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("production build identity is machine-readable and contains no credentials", () => {
  for (const field of [
    "VITE_BUILD_COMMIT_SHA",
    "VITE_BUILD_DATE",
    "VITE_BUILD_ENVIRONMENT",
    "VITE_SUPABASE_PROJECT_ID",
  ]) {
    assert.match(buildRoute, new RegExp(field));
  }
  // The active model must be read from the database. A hard-coded literal here
  // silently went stale when GDP v1.1 was activated, so /build.json — the one
  // endpoint whose job is to report what is deployed — reported the wrong model.
  assert.doesNotMatch(buildRoute, /dispensing_potential_model:\s*"gdp-/);
  assert.match(buildRoute, /dispensing_potential_methods/);
  assert.match(buildRoute, /\.eq\("active", true\)/);
  assert.match(buildRoute, /Cache-Control": "no-store"/);
  assert.doesNotMatch(buildRoute, /PUBLISHABLE_KEY|SERVICE_ROLE|SUPABASE_URL/);
});

test("production verifier fails closed on stale, unavailable or incompatible deployments", () => {
  assert.match(verifier, /build endpoint returned HTTP/);
  assert.match(verifier, /deployed commit does not match protected main/);
  assert.match(verifier, /wrong Supabase project/);
  assert.match(verifier, /process\.exitCode/);
});

test("lint removes filesystem sidecars before checking source", () => {
  assert.match(packageJson.scripts.lint, /clean:sidecars/);
  assert.match(packageJson.scripts.lint, /check:sidecars/);
  assert.equal(packageJson.scripts["verify:production"], "node scripts/verify-production.mjs");
});
