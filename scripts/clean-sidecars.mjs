import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const INCLUDE_GIT = process.argv.includes("--include-git");
const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const archiveRoot = path.join(
  os.tmpdir(),
  `pharmacy-scout-sidecars-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
);
let removed = 0;

if (ROOT === path.parse(ROOT).root || ROOT === os.homedir()) {
  throw new Error(`Refusing to clean unsafe root: ${ROOT}`);
}

async function walk(dir, relativeRoot = ROOT) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const target = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      await walk(target);
      continue;
    }

    if (entry.isFile() && (entry.name.startsWith("._") || entry.name.startsWith(".__"))) {
      const relative = path.relative(relativeRoot, target);
      const archived = path.join(archiveRoot, relative);
      await mkdir(path.dirname(archived), { recursive: true });
      await copyFile(target, archived);
      await rm(target, { force: true });
      removed += 1;
    }
  }
}

await walk(ROOT);

if (INCLUDE_GIT) {
  const gitCommonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  ).trim();

  if (
    gitCommonDir === path.parse(gitCommonDir).root ||
    gitCommonDir === os.homedir() ||
    !path.basename(gitCommonDir).endsWith(".git")
  ) {
    throw new Error(`Refusing to clean unsafe Git directory: ${gitCommonDir}`);
  }

  await walk(gitCommonDir, path.dirname(gitCommonDir));
}

console.log(
  removed === 0
    ? "No AppleDouble sidecars found."
    : `Archived and removed ${removed} AppleDouble sidecar(s): ${archiveRoot}`,
);
