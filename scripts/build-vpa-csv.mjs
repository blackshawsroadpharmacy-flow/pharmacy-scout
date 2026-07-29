#!/usr/bin/env node

// Build the VPA register CSV from a previously-captured JSON snapshot of
// records. The companion `scrape-vpa-register.mjs` writes these snapshots
// to `data/source/<timestamp>.records.json`; this script can also be pointed
// at a manual snapshot (e.g. one captured in a previous session) and emits
// the same CSV layout the live scraper produces.
//
// Usage:
//   node scripts/build-vpa-csv.mjs <path-to-records.json> [--out <csv-path>]

import fs from "node:fs/promises";
import path from "node:path";
import {
  VPA_CSV_COLUMNS,
  VPA_SOURCE,
  recordKey,
  recordToCsvRows,
  rowsToCsv,
} from "./lib/vpa-register-parse.mjs";

const SOURCE_URL = "https://pharmacy.vic.gov.au/register-search/";

function parseArgs(argv) {
  const args = { input: null, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        [
          "Usage: node scripts/build-vpa-csv.mjs <records.json> [--out <path>]",
          "",
          "Produces <out> (default: data/source/vpa-register-<timestamp>.csv)",
          "from a JSON snapshot of { premises_name, address_lines, ... } objects.",
        ].join("\n") + "\n",
      );
      process.exit(0);
    } else if (!args.input) {
      args.input = arg;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exitCode = 2;
    }
  }
  if (!args.input) {
    process.stderr.write("Usage: node scripts/build-vpa-csv.mjs <records.json> [--out <path>]\n");
    process.exitCode = 2;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) return;

  const inputPath = path.resolve(args.input);
  const raw = await fs.readFile(inputPath, "utf8");
  const snapshot = JSON.parse(raw);

  // Accept either a map keyed by sha1 (the live scraper writes this) or a
  // plain object map keyed by some other string (e.g. "name|address" from a
  // manual snapshot).
  const recordsByKey = new Map();
  for (const [key, value] of Object.entries(snapshot)) {
    if (!value || typeof value !== "object") continue;
    if (!value.premises_name || !Array.isArray(value.address_lines)) continue;
    const k = recordKey(value);
    if (!recordsByKey.has(k)) recordsByKey.set(k, value);
  }

  const scrapedAt = new Date().toISOString();
  const rows = [];
  for (const rec of recordsByKey.values()) {
    rows.push(
      ...recordToCsvRows(rec, {
        sourceTimestamp: scrapedAt,
        sourceUrl: SOURCE_URL,
      }),
    );
  }

  const root = process.cwd();
  const outPath = path.resolve(
    args.out ??
      path.join(root, "data", "source", `vpa-register-${scrapedAt.replace(/[:.]/g, "-")}.csv`),
  );
  const jsonPath = outPath.replace(/\.csv$/, ".records.json");

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const csv = rowsToCsv(rows, VPA_CSV_COLUMNS);
  await fs.writeFile(outPath, csv, "utf8");
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        source: VPA_SOURCE,
        source_url: SOURCE_URL,
        scraped_at: scrapedAt,
        premises_count: recordsByKey.size,
        row_count: rows.length,
        records: Array.from(recordsByKey.values()),
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
      `premises=${recordsByKey.size}`,
      `rows=${rows.length}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
