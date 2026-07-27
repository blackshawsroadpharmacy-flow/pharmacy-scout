import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("candidate assessment uses only the controlled preliminary labels", async () => {
  const [client, migration] = await Promise.all([
    read("src/lib/candidate-analysis.ts"),
    read("supabase/migrations/20260728100000_candidate_site_analysis.sql"),
  ]);
  const labels = [
    "appears to satisfy",
    "does not appear to satisfy",
    "insufficient evidence",
    "professional measurement required",
    "source coverage incomplete",
  ];
  for (const label of labels) assert.match(client, new RegExp(`"${label}"`));
  for (const match of migration.matchAll(/assessment_label := CASE([\s\S]*?)END;/g)) {
    const body = match[1];
    assert.doesNotMatch(body, /eligible|compliant|approved/i);
  }
});

test("all candidate proximity calculations stay in separate PostGIS functions", async () => {
  const [migration, client] = await Promise.all([
    read("supabase/migrations/20260728100000_candidate_site_analysis.sql"),
    read("src/lib/candidate-analysis.ts"),
  ]);
  for (const functionName of [
    "candidate_nearest_pharmacy",
    "candidate_pharmacies_within_radius",
    "candidate_external_within_500m",
    "candidate_site_analysis",
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${functionName}`));
  }
  assert.match(migration, /ST_Distance/);
  assert.match(migration, /ST_DWithin/);
  assert.doesNotMatch(client, /haversine|ST_Distance|ST_DWithin/i);
});

test("map and panel share one candidate point, radius, and server analysis", async () => {
  const screen = await read("src/components/map/map-screen.tsx");
  assert.match(screen, /fetchCandidateAnalysis\(candidatePoint!, candidateRadiusM, signal\)/);
  assert.match(screen, /candidatePoint=\{candidateMode \? candidatePoint : null\}/);
  assert.match(screen, /candidateRadiusM=\{candidateRadiusM\}/);
  assert.match(screen, /<CandidateAnalysisPanel[\s\S]*?point=\{candidatePoint\}/);
  assert.match(screen, /radiusM=\{candidateRadiusM\}/);
});

test("candidate location supports map click, address search, and Victorian validation", async () => {
  const [screen, client] = await Promise.all([
    read("src/components/map/map-screen.tsx"),
    read("src/lib/candidate-analysis.ts"),
  ]);
  assert.match(screen, /onMapClick=[\s\S]*?setCandidate\(\{ lat, lng/);
  assert.match(screen, /searchVictorianAddress\(q\)/);
  assert.match(client, /Candidate location is outside Victorian operating bounds/);
  assert.match(client, /bounded: "1"/);
});

test("print rendering isolates the preliminary assessment and preserves caveats", async () => {
  const [panel, styles] = await Promise.all([
    read("src/components/map/candidate-analysis-panel.tsx"),
    read("src/styles.css"),
  ]);
  assert.match(panel, /window\.print\(\)/);
  assert.match(panel, /id="candidate-assessment"/);
  assert.match(panel, /Not legal advice or a final Pharmacy Location Rule determination/);
  assert.match(styles, /@media print[\s\S]*?#candidate-assessment/);
});

test("prohibited commercial and regulatory attributes are never inferred", async () => {
  const migration = await read("supabase/migrations/20260728100000_candidate_site_analysis.sql");
  for (const warning of [
    "Supermarket floor area is not inferred",
    "General-practitioner FTE and PBS prescriber counts are not inferred",
    "Legal eligibility and regulatory compliance are not inferred",
  ]) {
    assert.match(migration, new RegExp(warning));
  }
});
