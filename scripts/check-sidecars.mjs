import { readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([".git", "node_modules"]);

async function walk(dir, results) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      await walk(path.join(dir, entry.name), results);
      continue;
    }

    if (entry.isFile() && (entry.name.startsWith("._") || entry.name.startsWith(".__"))) {
      results.push(path.relative(ROOT, path.join(dir, entry.name)));
    }
  }
}

const sidecars = [];
await walk(ROOT, sidecars);

if (sidecars.length > 0) {
  console.error("AppleDouble sidecar files detected. Remove them before building or previewing:");
  for (const file of sidecars.sort()) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("No AppleDouble sidecar files found.");
