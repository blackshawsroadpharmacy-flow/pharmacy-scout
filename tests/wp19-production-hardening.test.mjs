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
    "gdp-v1.0.0",
  ]) {
    assert.match(buildRoute, new RegExp(field));
  }
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
