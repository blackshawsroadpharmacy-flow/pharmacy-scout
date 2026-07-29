#!/usr/bin/env node

// Scrape the Victorian Pharmacy Authority (VPA) public register of
// pharmacies from `pharmacy.vic.gov.au/register-search/` and write the full
// unfiltered set of registered premises + licensees to disk.
//
// The search UI is a WordPress AJAX endpoint that returns an HTML fragment
// capped at 50 records per response. To get the full ~1,600-record register
// we partition the search by Victorian postcode (3000-3999); the vast
// majority of postcodes return 0 records, the busy ones return well under
// 50, and dedupe-by-stable-key collapses overlaps.
//
// Usage:
//   node scripts/scrape-vpa-register.mjs
//   node scripts/scrape-vpa-register.mjs --delay-ms 200
//   node scripts/scrape-vpa-register.mjs --out data/source/vpa-register.csv

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
const ENDPOINT =
  "https://pharmacy.vic.gov.au/wp-admin/admin-ajax.php?action=newcrm_handler_register_search";
const USER_AGENT = "PharmacyScoutVpaScraper/0.1 (local-repo-script)";

const DEFAULT_DELAY_MS = Number.parseInt(process.env.VPA_SCRAPE_DELAY_MS ?? "150", 10);
const POSTCODE_MIN = 3000;
const POSTCODE_MAX = 3999;
const RECORD_CAP = 50;
const REQUEST_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
  const args = { delayMs: DEFAULT_DELAY_MS, out: null, cacheDir: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--delay-ms") args.delayMs = Number.parseInt(argv[++i], 10);
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--cache-dir") args.cacheDir = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage: node scripts/scrape-vpa-register.mjs [options]",
          "",
          "Options:",
          "  --delay-ms <ms>      Delay between requests (default 150)",
          "  --out <path>         CSV output path",
          "  --cache-dir <path>   Directory for raw response cache",
          "  -h, --help           Show this help",
          "",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exitCode = 2;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const root = process.cwd();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cacheDir = path.resolve(
    args.cacheDir ?? path.join(root, "data", "source", ".vpa-cache", timestamp),
  );
  const outPath = path.resolve(
    args.out ?? path.join(root, "data", "source", `vpa-register-${timestamp}.csv`),
  );
  const jsonPath = outPath.replace(/\.csv$/, ".records.json");

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const records = new Map();
  const postcodes = [];
  for (let p = POSTCODE_MIN; p <= POSTCODE_MAX; p += 1) {
    postcodes.push(String(p));
  }
  const total = postcodes.length;

  const startedAt = Date.now();
  let fetched = 0;
  let cacheHits = 0;
  let errors = 0;

  process.stderr.write(
    `Scraping VPA register: ${total} postcodes (${POSTCODE_MIN}-${POSTCODE_MAX})\n`,
  );

  for (let i = 0; i < postcodes.length; i += 1) {
    const postcode = postcodes[i];
    const cachePath = path.join(cacheDir, `postcode-${postcode}.html`);

    let html;
    try {
      html = await fetchPostcodePage(postcode, cachePath);
    } catch (error) {
      errors += 1;
      process.stderr.write(
        `\n  ! ${postcode} failed: ${error instanceof Error ? error.message : error}\n`,
      );
      continue;
    }

    const result = extractResultBanner(html);
    if (result && result.total > RECORD_CAP) {
      process.stderr.write(
        `\n  ! ${postcode} returned ${result.total} results (cap ${RECORD_CAP}) — partition needed\n`,
      );
    }

    const recordMatches = [...html.matchAll(/<div class="row record">/g)];
    let added = 0;
    for (let i = 0; i < recordMatches.length; i += 1) {
      const start = recordMatches[i].index;
      const nextStart = i + 1 < recordMatches.length ? recordMatches[i + 1].index : html.length;
      const recordHtml = html.slice(start, nextStart);
      const parsed = parseVpaRecord(recordHtml);
      if (!parsed) continue;
      const key = recordKey(parsed);
      if (!records.has(key)) {
        records.set(key, parsed);
        added += 1;
      }
    }

    fetched += 1;
    const pct = ((fetched / total) * 100).toFixed(1);
    process.stderr.write(
      `\r  ${fetched}/${total} postcodes (${pct}%) — ${records.size} unique premises`,
    );

    if (args.delayMs > 0) {
      await delay(args.delayMs);
    }
  }

  const scrapedAt = new Date().toISOString();
  const scrapedRows = [];
  for (const rec of records.values()) {
    scrapedRows.push(
      ...recordToCsvRows(rec, {
        sourceTimestamp: scrapedAt,
        sourceUrl: SOURCE_URL,
      }),
    );
  }

  const csv = rowsToCsv(scrapedRows, VPA_CSV_COLUMNS);
  await fs.writeFile(outPath, csv, "utf8");
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        source: VPA_SOURCE,
        source_url: SOURCE_URL,
        scraped_at: scrapedAt,
        premises_count: records.size,
        row_count: scrapedRows.length,
        records: Array.from(records.values()),
      },
      null,
      2,
    ),
    "utf8",
  );

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(
    `\nDone in ${elapsed}s — ${records.size} premises, ${scrapedRows.length} CSV rows (${errors} postcode errors).\n`,
  );
  process.stdout.write(
    [
      `csv=${outPath}`,
      `json=${jsonPath}`,
      `cache=${cacheDir}`,
      `premises=${records.size}`,
      `rows=${scrapedRows.length}`,
      `errors=${errors}`,
    ].join("\n") + "\n",
  );
}

async function fetchPostcodePage(postcode, cachePath) {
  try {
    const cached = await fs.readFile(cachePath, "utf8");
    return cached;
  } catch {
    // miss
  }

  const body = new URLSearchParams({
    action: "newcrm_handler_register_search",
    searchterm: postcode,
    searchtype: "premises",
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "user-agent": USER_AGENT,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        accept: "text/html, */*; q=0.1",
        "x-requested-with": "XMLHttpRequest",
        origin: "https://pharmacy.vic.gov.au",
        referer: SOURCE_URL,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for postcode ${postcode}`);
    }
    const text = await response.text();
    await fs.writeFile(cachePath, text, "utf8");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function extractResultBanner(html) {
  const m = html.match(/(\d+)\s+results found/);
  if (!m) return null;
  return { total: Number.parseInt(m[1], 10) };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
