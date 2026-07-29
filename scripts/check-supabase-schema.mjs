import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const committedTypes = path.join(root, "src/integrations/supabase/types.ts");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pharmacy-scout-schema-"));
const generatedTypes = path.join(temporaryDirectory, "types.ts");

function extractBalancedBlock(source, marker, startAt = 0) {
  const markerIndex = source.indexOf(marker, startAt);
  if (markerIndex === -1) {
    throw new Error(`Could not find generated schema marker: ${marker}`);
  }

  const openingBrace = source.indexOf("{", markerIndex);
  let depth = 0;

  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      return {
        block: source.slice(markerIndex, index + 1).trim(),
        end: index + 1,
      };
    }
  }

  throw new Error(`Unbalanced generated schema block: ${marker}`);
}

function publicSchemaSignature(source) {
  const databaseStart = source.indexOf("export type Database");
  const databasePublic = extractBalancedBlock(source, "  public: {", databaseStart);
  const constantsStart = source.indexOf("export const Constants", databasePublic.end);
  const constantsPublic = extractBalancedBlock(source, "  public: {", constantsStart);

  return `${databasePublic.block}\n${constantsPublic.block}`;
}

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

  if (publicSchemaSignature(expected) !== publicSchemaSignature(actual)) {
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
