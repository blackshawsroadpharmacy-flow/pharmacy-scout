import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const committedTypes = path.join(root, "src/integrations/supabase/types.ts");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pharmacy-scout-schema-"));
const generatedTypes = path.join(temporaryDirectory, "types.ts");

try {
  const output = execFileSync(
    "supabase",
    ["gen", "types", "typescript", "--local", "--schema", "public"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  await writeFile(generatedTypes, output);

  const [expected, actual] = await Promise.all([
    readFile(committedTypes, "utf8"),
    readFile(generatedTypes, "utf8"),
  ]);

  if (expected !== actual) {
    console.error(
      "Supabase schema drift detected. Run `supabase gen types typescript --local --schema public > src/integrations/supabase/types.ts` after applying all migrations.",
    );
    spawnSync("git", ["diff", "--no-index", "--", committedTypes, generatedTypes], {
      cwd: root,
      stdio: "inherit",
    });
    process.exitCode = 1;
  } else {
    console.log("Committed Supabase types match the schema produced by local migrations.");
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
