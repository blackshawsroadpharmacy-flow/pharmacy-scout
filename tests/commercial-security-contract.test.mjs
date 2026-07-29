import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const dossier = fs.readFileSync(path.join(root, "src/components/map/right-dossier.tsx"), "utf8");
const profiles = fs.readFileSync(path.join(root, "src/lib/pharmacy-profiles.public.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260728173000_harden_commercial_security.sql"),
  "utf8",
);

test("anonymous dossier users see no private commercial controls", () => {
  assert.match(dossier, /if \(!authed\)/);
  assert.match(dossier, /Sign in and choose an organisation/);
  assert.match(dossier, /Private organisation workspace/);
});

test("attachments use organisation paths, bounded file validation and signed URLs", () => {
  assert.match(dossier, /`\$\{organisationId\}\/\$\{premisesId\}\//);
  assert.match(dossier, /validateCommercialFile\(file\)/);
  assert.match(dossier, /\.createSignedUrl\(/);
  assert.match(dossier, /60 \* 30/);
  assert.doesNotMatch(dossier, /getPublicUrl/);
  assert.match(migration, /file_size_limit = 26214400/);
  assert.match(migration, /allowed_mime_types/);
});

test("commercial queries require and scope to the current organisation", () => {
  assert.match(profiles, /getCurrentOrganisationId/);
  assert.match(profiles, /\.eq\("organisation_id", organisationId\)/);
  assert.match(profiles, /organisation_id: organisationId/);
  assert.match(profiles, /\.is\("deleted_at", null\)/);
});

test("security migration removes public policies and preserves public discovery", () => {
  assert.match(migration, /REVOKE ALL ON public\.pharmacy_profiles FROM anon/);
  assert.match(migration, /DROP POLICY IF EXISTS "Public can read im bucket objects"/);
  assert.match(migration, /orphaned_demo = true WHERE organisation_id IS NULL/);
  assert.doesNotMatch(migration, /REVOKE .*pharmacy_premises.*anon/);
});

test("important commercial changes are audited without note or document contents", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.commercial_audit_events/);
  assert.match(migration, /'stage_change'/);
  assert.match(migration, /'document_delete'/);
  assert.doesNotMatch(migration, /note_text.*metadata/);
});
