import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260728183000_link_pharmacies_to_pipeline.sql"),
  "utf8",
);
const dossier = fs.readFileSync(path.join(root, "src/components/map/right-dossier.tsx"), "utf8");

test("pipeline additions retain a canonical pharmacy link and immutable identity snapshot", () => {
  assert.match(migration, /premises_id/);
  assert.match(migration, /canonical_name_snapshot/);
  assert.match(migration, /canonical_address_snapshot/);
  assert.match(migration, /ux_pharmacy_businesses_org_premises/);
  assert.match(migration, /ON CONFLICT \(organisation_id, premises_id\)/);
});

test("pipeline RPCs are authenticated and organisation scoped", () => {
  assert.match(migration, /public\.is_org_member\(org_id\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.add_pharmacy_to_pipeline/);
  assert.match(migration, /GRANT EXECUTE .*authenticated/s);
});

test("pharmacy dossier exposes add and view pipeline actions", () => {
  assert.match(dossier, /Add to acquisition pipeline/);
  assert.match(dossier, /View in acquisition pipeline/);
  assert.match(dossier, /addPharmacyToPipeline/);
});
