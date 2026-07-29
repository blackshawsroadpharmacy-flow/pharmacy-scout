import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  auditVpaRows,
  classifyPremisesMatch,
  groupVpaRows,
  parseCsv,
  sha256,
} from "./lib/vpa-import-staging.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
const file = valueAfter("--file");
if (!file) throw new Error("Usage: npm run import:vpa-register -- --file <csv> --dry-run");
if (!args.includes("--dry-run")) {
  throw new Error(
    "Only --dry-run is supported. Canonical promotion requires the reviewed admin RPC.",
  );
}
const canonicalFile = valueAfter("--canonical");
const outputDirectory =
  valueAfter("--output") ?? path.join(process.cwd(), ".private", "vpa-import-reports");
const csv = await readFile(path.resolve(file), "utf8");
const rows = parseCsv(csv);
const premises = groupVpaRows(rows);
const canonicalRows = canonicalFile
  ? JSON.parse(await readFile(path.resolve(canonicalFile), "utf8"))
  : [];
const staged = premises.map((source) => ({
  source,
  match: classifyPremisesMatch(source, canonicalRows),
}));
const dispositionCounts = Object.fromEntries(
  [...new Set(staged.map((item) => item.match.disposition))]
    .sort()
    .map((kind) => [kind, staged.filter((item) => item.match.disposition === kind).length]),
);
const report = {
  generated_at: new Date().toISOString(),
  dry_run: true,
  canonical_mutations: 0,
  source: {
    absolute_path: path.resolve(file),
    file_name: path.basename(file),
    sha256: sha256(csv),
    source_url: rows[0]?.source_url ?? null,
    scrape_timestamp: rows[0]?.scraped_at ?? null,
  },
  audit: auditVpaRows(rows),
  canonical_input: canonicalFile ? path.resolve(canonicalFile) : null,
  disposition_counts: dispositionCounts,
  every_premises_has_disposition: staged.every((item) => item.match.disposition),
  staged,
};
await mkdir(outputDirectory, { recursive: true });
const stem = `${path.basename(file, path.extname(file))}-${report.source.sha256.slice(0, 12)}`;
const jsonPath = path.join(outputDirectory, `${stem}.dry-run.json`);
const csvPath = path.join(outputDirectory, `${stem}.review.csv`);
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
const reviewRows = [
  [
    "source_key",
    "premises_name",
    "full_address",
    "registration_status",
    "licensee_count",
    "disposition",
    "canonical_premises_id",
    "score",
    "review_status",
    "factors",
    "conflicts",
  ],
  ...staged.map(({ source, match }) => [
    source.source_key,
    source.premises_name,
    source.full_address,
    source.registration_status,
    source.licensees.length,
    match.disposition,
    match.canonical_premises_id ?? "",
    match.score,
    match.review_status,
    match.factors.join("|"),
    match.conflicts.join("|"),
  ]),
];
const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
await writeFile(csvPath, `${reviewRows.map((row) => row.map(escape).join(",")).join("\n")}\n`, {
  mode: 0o600,
});
console.log(
  JSON.stringify(
    {
      json_report: jsonPath,
      csv_report: csvPath,
      ...report.audit,
      disposition_counts: dispositionCounts,
    },
    null,
    2,
  ),
);
