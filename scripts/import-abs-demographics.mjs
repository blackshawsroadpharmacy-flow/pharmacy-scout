import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";

const GCP_URL =
  "https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SA2_for_VIC_short-header.zip";
const SEIFA_URL =
  "https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021/Statistical%20Area%20Level%202%2C%20Indexes%2C%20SEIFA%202021.xlsx";
const output =
  process.argv[2] ?? "supabase/migrations/20260729143000_official_abs_demographic_enrichment.sql";
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pharmacy-scout-abs-"));

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}
function checksum(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function csvRows(source) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}
async function csvByCode(file) {
  const rows = csvRows(await readFile(file, "utf8"));
  const header = rows[0].map((value) => value.replace(/^\uFEFF/, ""));
  return new Map(
    rows
      .slice(1)
      .map((values) => [
        values[0],
        Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""])),
      ]),
  );
}
function numberOrNull(value) {
  if (value == null || value === "" || value === "np" || value === "..") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function percent(numerator, denominator) {
  return numerator == null || denominator == null || denominator <= 0
    ? null
    : Math.round((numerator / denominator) * 10_000) / 100;
}
function sqlNumber(value) {
  return value == null ? "NULL" : String(value);
}
function sqlString(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

try {
  const zipPath = path.join(temporaryDirectory, "gcp.zip");
  const seifaPath = path.join(temporaryDirectory, "seifa.xlsx");
  await Promise.all([download(GCP_URL, zipPath), download(SEIFA_URL, seifaPath)]);
  execFileSync("unzip", ["-q", zipPath, "-d", temporaryDirectory]);
  const censusDirectory = path.join(
    temporaryDirectory,
    "2021 Census GCP Statistical Area 2 for VIC",
  );
  const [g01, g18, g34] = await Promise.all(
    ["G01", "G18", "G34"].map((table) =>
      csvByCode(path.join(censusDirectory, `2021Census_${table}_VIC_SA2.csv`)),
    ),
  );
  const workbook = XLSX.readFile(seifaPath);
  const seifaRows = XLSX.utils.sheet_to_json(workbook.Sheets["Table 2"], {
    header: 1,
    range: 6,
    blankrows: false,
  });
  const economicRows = XLSX.utils.sheet_to_json(workbook.Sheets["Table 4"], {
    header: 1,
    range: 6,
    blankrows: false,
  });
  const seifa = new Map(
    seifaRows
      .filter((row) => String(row[0] ?? "").startsWith("2"))
      .map((row) => [
        String(row[0]),
        {
          name: row[1],
          disadvantageScore: numberOrNull(row[3]),
          disadvantageDecile: numberOrNull(row[11]),
          disadvantagePercentile: numberOrNull(row[12]),
        },
      ]),
  );
  for (const row of economicRows.filter((item) => String(item[0] ?? "").startsWith("2"))) {
    const target = seifa.get(String(row[0]));
    if (target) {
      target.economicResourcesScore = numberOrNull(row[3]);
      target.economicResourcesDecile = numberOrNull(row[11]);
      target.economicResourcesPercentile = numberOrNull(row[12]);
    }
  }

  const boundaryMigration = await readFile(
    "supabase/migrations/20260729003100_seed_abs_victorian_sa2_population.sql",
    "utf8",
  );
  const boundaryCodes = new Set(
    [...boundaryMigration.matchAll(/'((?:2)[0-9]{8})'/g)].map((match) => match[1]),
  );
  const codes = [...g01.keys()].filter((code) => boundaryCodes.has(code)).sort();
  const tuples = codes.map((code) => {
    const population = g01.get(code);
    const assistance = g18.get(code);
    const vehicles = g34.get(code);
    const total = numberOrNull(population?.Tot_P_P);
    const age65 = [population?.Age_65_74_yr_P, population?.Age_75_84_yr_P, population?.Age_85ov_P]
      .map(numberOrNull)
      .reduce((sum, value) => (sum == null || value == null ? null : sum + value), 0);
    const age75 = [population?.Age_75_84_yr_P, population?.Age_85ov_P]
      .map(numberOrNull)
      .reduce((sum, value) => (sum == null || value == null ? null : sum + value), 0);
    const underFive = numberOrNull(population?.Age_0_4_yr_P);
    const need = numberOrNull(assistance?.P_Tot_Need_for_assistance);
    const noVehicle = numberOrNull(vehicles?.Num_MVs_per_dweling_0_MVs);
    const vehicleDenominator = numberOrNull(vehicles?.Num_MVs_per_dweling_Tot);
    const index = seifa.get(code) ?? {};
    const missing = [
      total == null && "2021 Census total population unavailable or suppressed",
      age65 == null && "Age 65+ unavailable or suppressed",
      age75 == null && "Age 75+ unavailable or suppressed",
      underFive == null && "Under-five population unavailable or suppressed",
      need == null && "Core activity need for assistance unavailable or suppressed",
      noVehicle == null && "No-motor-vehicle dwellings unavailable or suppressed",
      index.disadvantageScore == null && "SEIFA IRSD score unavailable for this area",
    ].filter(Boolean);
    return `(${[
      sqlString(code),
      "2021",
      sqlString(population?.SA2_NAME_2021 ?? index.name ?? code),
      sqlNumber(total),
      sqlNumber(age65),
      sqlNumber(percent(age65, total)),
      sqlNumber(age75),
      sqlNumber(percent(age75, total)),
      sqlNumber(underFive),
      sqlNumber(percent(underFive, total)),
      sqlNumber(need),
      sqlNumber(percent(need, total)),
      sqlNumber(noVehicle),
      sqlNumber(vehicleDenominator),
      sqlNumber(percent(noVehicle, vehicleDenominator)),
      sqlNumber(index.disadvantageScore),
      sqlNumber(index.disadvantageDecile),
      sqlNumber(index.disadvantagePercentile),
      sqlNumber(index.economicResourcesScore),
      sqlNumber(index.economicResourcesDecile),
      sqlNumber(index.economicResourcesPercentile),
      sqlString(missing.length ? "partial" : "complete"),
      sqlString(JSON.stringify(missing)),
      "'21000000-0000-4000-8000-000000000001'",
      "'21000000-0000-4000-8000-000000000002'",
    ].join(",")})`;
  });
  const gcpChecksum = checksum(await readFile(zipPath));
  const seifaChecksum = checksum(await readFile(seifaPath));
  const template = await readFile(
    new URL("./templates/wp21-demographic-migration.sql", import.meta.url),
    "utf8",
  );
  await writeFile(
    output,
    template
      .replaceAll("__GCP_URL__", GCP_URL)
      .replaceAll("__SEIFA_URL__", SEIFA_URL)
      .replaceAll("__GCP_SHA256__", gcpChecksum)
      .replaceAll("__SEIFA_SHA256__", seifaChecksum)
      .replace("__DEMOGRAPHIC_ROWS__", tuples.join(",\n")),
  );
  console.log(`Wrote ${codes.length} official ABS SA2 profiles to ${output}`);
  console.log(`GCP sha256 ${gcpChecksum}`);
  console.log(`SEIFA sha256 ${seifaChecksum}`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
