import process from "node:process";

const target = process.env.PRODUCTION_URL;
const expectedCommit = process.env.EXPECTED_COMMIT;
const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT ?? "gvrwrqcftlaavxarmgfk";

if (!target) {
  console.error("PRODUCTION_URL is required.");
  process.exit(2);
}

const base = new URL(target);
const result = {
  target: base.origin,
  status: "unavailable",
  deployed_commit: null,
  expected_commit: expectedCommit ?? null,
  supabase_project: null,
  expected_supabase_project: expectedProject,
  checked_at: new Date().toISOString(),
  issues: [],
};

try {
  const response = await fetch(new URL("/build.json", base), {
    redirect: "follow",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    result.issues.push(`build endpoint returned HTTP ${response.status}`);
  } else {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      result.issues.push(`build endpoint returned ${contentType || "an unknown content type"}`);
    } else {
      const build = await response.json();
      result.deployed_commit = typeof build.commit === "string" ? build.commit : null;
      result.supabase_project =
        typeof build.supabase_project === "string" ? build.supabase_project : null;
      result.status = "reachable";
      if (expectedCommit && !result.deployed_commit?.startsWith(expectedCommit)) {
        result.status = "stale";
        result.issues.push("deployed commit does not match protected main");
      }
      if (result.supabase_project !== expectedProject) {
        result.status = "incompatible";
        result.issues.push("deployment points at the wrong Supabase project");
      }
    }
  }
} catch (error) {
  result.issues.push(error instanceof Error ? error.message : String(error));
}

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === "reachable" && result.issues.length === 0 ? 0 : 1;
