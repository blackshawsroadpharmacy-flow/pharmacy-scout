import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260728193000_pipeline_map_statuses.sql"),
  "utf8",
);
const screen = fs.readFileSync(path.join(root, "src/components/map/map-screen.tsx"), "utf8");
const map = fs.readFileSync(path.join(root, "src/components/map/map-view.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");

test("pipeline map status lookup is bounded, authenticated and organisation scoped", () => {
  assert.match(migration, /LIMIT 500/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.is_org_member\(current_organisation_id\)/);
  assert.match(migration, /REVOKE ALL .* FROM PUBLIC/s);
  assert.match(migration, /GRANT EXECUTE .* TO authenticated/s);
});

test("anonymous map sessions never request or render private pipeline status", () => {
  assert.match(screen, /enabled: authed && visiblePremisesIds\.length > 0/);
  assert.match(screen, /const pipelineStatuses = authed/);
  assert.match(screen, /\{authed && pipelineStatuses\.size > 0/);
});

test("pipeline map filters and stage halos preserve the pharmacy marker", () => {
  assert.match(screen, /pipelineStageFilter/);
  assert.match(map, /pipeline-stage-\$\{pipelineStage\}/);
  assert.match(styles, /\.pharmacy-pin\[class\*="pipeline-stage-"\]/);
  assert.match(styles, /background: #ef1b24/);
  for (const stage of [
    "watchlist",
    "contacting",
    "im_received",
    "due_diligence",
    "offer",
    "passed",
    "acquired",
  ]) {
    assert.match(styles, new RegExp(`pipeline-stage-${stage}`));
  }
});
