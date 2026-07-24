import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([".git", "node_modules"]);

async function walk(dir) {
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
      await rm(target, { force: true });
    }
  }
}

await walk(ROOT);
console.log("AppleDouble sidecar cleanup complete.");
