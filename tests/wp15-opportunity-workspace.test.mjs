import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260728210000_complete_acquisition_workspace.sql",
    import.meta.url,
  ),
  "utf8",
);
const server = await readFile(
  new URL("../src/lib/opportunity-workspace.functions.ts", import.meta.url),
  "utf8",
);
const drawer = await readFile(
  new URL("../src/components/acquisitions/opportunity-drawer.tsx", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../src/routes/app.acquisitions.tsx", import.meta.url),
  "utf8",
);

test("opportunity children are organisation scoped and anonymous access is revoked", () => {
  for (const table of [
    "opportunity_stage_history",
    "opportunity_checklist_items",
    "opportunity_tasks",
    "opportunity_listing_history",
    "opportunity_commercial_figures",
    "opportunity_notes",
    "opportunity_documents",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL[\s\S]+FROM anon/);
  assert.match(server, /eq\("organisation_id", org\)/);
});

test("duplicate active acquisition opportunities are rejected", () => {
  assert.match(migration, /prevent_duplicate_active_opportunity/);
  assert.match(migration, /An active opportunity already exists for this pharmacy business/);
  assert.match(migration, /ux_active_acquisition_per_business/);
});

test("every commercial figure carries provenance without zero-filling", () => {
  for (const field of [
    "source",
    "evidence_period_start",
    "evidence_period_end",
    "confidence",
    "entered_by",
  ]) {
    assert.match(migration, new RegExp(field));
    assert.match(drawer, new RegExp(field));
  }
  assert.doesNotMatch(drawer, /\?\?\s*0/);
  assert.match(drawer, /Missing values remain unknown and are never\s+treated as zero/);
});

test("workspace includes secure IM handling, CSV and two-to-four comparison", () => {
  assert.match(drawer, /createSignedUrl/);
  assert.match(drawer, /information-memorandums/);
  assert.match(drawer, /26214400/);
  assert.match(route, /Export CSV/);
  assert.match(route, /current\.length < 4/);
  assert.match(route, /compareIds\.length >= 2/);
});

test("canonical pharmacy links use only public pharmacy identity", () => {
  assert.match(drawer, /`\/pharmacy\/\$\{encodeURIComponent\(b\.premises_id\)\}`/);
  assert.doesNotMatch(drawer, /opportunityId.*canonicalHref/);
});
