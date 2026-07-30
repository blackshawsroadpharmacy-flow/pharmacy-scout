import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const premisesClient = await readFile(
  new URL("../src/lib/premises-public.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260730152000_public_pharmacy_access_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);

test("public map, search and dossier use bounded explicit interfaces", () => {
  assert.match(premisesClient, /\.rpc\("pharmacy_points_in_viewport"/);
  assert.match(premisesClient, /\.rpc\("public_pharmacy_dossier"/);
  assert.doesNotMatch(premisesClient, /\.from\("pharmacy_premises"/);
  assert.doesNotMatch(premisesClient, /\.from\("pharmacy_premises_geo"/);
  assert.match(migration, /REVOKE ALL ON public\.pharmacy_premises FROM anon/);
  assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 500\), 1\), 2000\)/);
});

test("public dossier projection excludes private and reviewer fields", () => {
  const dossier = migration.match(
    /CREATE OR REPLACE FUNCTION public\.public_pharmacy_dossier[\s\S]*?REVOKE ALL ON FUNCTION public\.public_pharmacy_dossier/,
  )?.[0];
  assert.ok(dossier);
  for (const forbidden of [
    "premises.notes",
    "premises.vpa_match_confidence",
    "premises.vpa_match_method",
    "premises.vpa_review_status",
    "premises.vpa_geocode_status",
    "premises.vpa_source_row_fingerprint",
  ]) {
    assert.doesNotMatch(dossier, new RegExp(forbidden.replaceAll(".", "\\.")));
  }
});

test("anonymous licensee access remains a truthful sign-in state", () => {
  assert.match(premisesClient, /licenseesRes\.error\.code === "42501"/);
  assert.match(premisesClient, /"sign_in_required"/);
  assert.match(
    premisesClient,
    /licenseesRes\.error[\s\S]*?"sign_in_required"[\s\S]*?"unavailable"[\s\S]*?: "loaded"/,
  );
});
