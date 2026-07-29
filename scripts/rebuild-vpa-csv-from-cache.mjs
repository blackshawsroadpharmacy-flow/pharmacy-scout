#!/usr/bin/env node

// Re-emit the VPA register CSV from an existing per-postcode cache directory
// (created by `scrape-vpa-register.mjs`). Useful when the parser has been
// fixed and you want to regenerate the CSV without hitting the network.
//
// Usage:
//   node scripts/rebuild-vpa-csv-from-cache.mjs <cache-dir> [--out <csv-path>]

import fs from "node:fs/promises";
import path from "node:path";
import {
  VPA_CSV_COLUMNS,
  VPA_SOURCE,
  parseVpaRecord,
  recordKey,
  recordToCsvRows,
  rowsToCsv,
} from "./lib/vpa-register-parse.mjs";

const SOURCE_URL = "https://pharmacy.vic.gov.au/register-search/";

function parseArgs(argv) {
  const args = { cacheDir: null, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        ["Usage: node scripts/rebuild-vpa-csv-from-cache.mjs <cache-dir> [--out <path>]"].join(
          "\n",
        ) + "\n",
      );
      process.exit(0);
    } else if (!args.cacheDir) {
      args.cacheDir = arg;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exitCode = 2;
    }
  }
  if (!args.cacheDir) {
    process.stderr.write(
      "Usage: node scripts/rebuild-vpa-csv-from-cache.mjs <cache-dir> [--out <path>]\n",
    );
    process.exitCode = 2;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.cacheDir) return;

  const cacheDir = path.resolve(args.cacheDir);
  const entries = await fs.readdir(cacheDir);
  const files = entries.filter((e) => e.startsWith("postcode-") && e.endsWith(".html"));

  const records = new Map();
  let capWarnings = 0;
  for (const file of files) {
    const filePath = path.join(cacheDir, file);
    const html = await fs.readFile(filePath, "utf8");
    const banner = html.match(/(\d+)\s+results found/);
    if (banner && Number.parseInt(banner[1], 10) > 50) {
      capWarnings += 1;
    }

    const matches = [...html.matchAll(/<div class="row record">/g)];
    for (let i = 0; i < matches.length; i += 1) {
      const start = matches[i].index;
      const next = i + 1 < matches.length ? matches[i + 1].index : html.length;
      const parsed = parseVpaRecord(html.slice(start, next));
      if (!parsed) continue;
      const key = recordKey(parsed);
      if (!records.has(key)) records.set(key, parsed);
    }
  }

  const scrapedAt = new Date().toISOString();
  const rows = [];
  for (const rec of records.values()) {
    rows.push(
      ...recordToCsvRows(rec, {
        sourceTimestamp: scrapedAt,
        sourceUrl: SOURCE_URL,
      }),
    );
  }

  const outPath = path.resolve(
    args.out ??
      path.join(
        process.cwd(),
        "data",
        "source",
        `vpa-register-${scrapedAt.replace(/[:.]/g, "-")}.csv`,
      ),
  );
  const jsonPath = outPath.replace(/\.csv$/, ".records.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  await fs.writeFile(outPath, rowsToCsv(rows, VPA_CSV_COLUMNS), "utf8");
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        source: VPA_SOURCE,
        source_url: SOURCE_URL,
        scraped_at: scrapedAt,
        premises_count: records.size,
        row_count: rows.length,
        cap_warnings: capWarnings,
        records: Array.from(records.values()),
      },
      null,
      2,
    ),
    "utf8",
  );

  process.stdout.write(
    [
      `csv=${outPath}`,
      `json=${jsonPath}`,
      `premises=${records.size}`,
      `rows=${rows.length}`,
      `cap_warnings=${capWarnings}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
