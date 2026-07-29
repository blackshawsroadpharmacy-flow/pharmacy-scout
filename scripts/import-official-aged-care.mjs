import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const SOURCE_URL =
  "https://www.gen-agedcaredata.gov.au/getmedia/d0c1b04b-89ee-4636-aeaa-dd49dd85f2f1/VIC-Service-List-2025";
const output =
  process.argv[2] ?? "supabase/migrations/20260729180000_official_healthcare_demand_anchors.sql";
const temp = await mkdtemp(path.join(os.tmpdir(), "pharmacy-scout-aged-care-"));

function quote(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}
function number(value) {
  if (value == null || value === "") return "NULL";
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? String(parsed) : "NULL";
}
function uuid(value) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function column(x) {
  const starts = [
    52, 197, 295, 334, 348, 372, 414, 512, 536, 556, 583, 688, 728, 765, 783, 801, 869, 888, 941,
    975, 993, 1013, 1053, 1072, 1093,
  ];
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) if (x >= starts[i] - 3) index = i;
  return index;
}

try {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Official aged-care source returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const records = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map();
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] * 10) / 10;
      const cells = lines.get(y) ?? Array.from({ length: 25 }, () => "");
      const index = column(item.transform[4]);
      cells[index] = `${cells[index]} ${item.str}`.trim();
      lines.set(y, cells);
    }
    for (const [y, cells] of [...lines.entries()].sort((a, b) => b[0] - a[0])) {
      if (y > 760 || cells[0] === "Service Name" || !cells[0]) continue;
      const latitude = Number(cells[22]);
      const longitude = Number(cells[23]);
      const residentialPlaces = cells[7].trim() ? Number(cells[7]) : Number.NaN;
      const careType = cells[6];
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude > -33 ||
        latitude < -40 ||
        longitude < 140 ||
        longitude > 150 ||
        (!(Number.isFinite(residentialPlaces) && residentialPlaces > 0) &&
          !/Residential|Multi-Purpose/i.test(careType))
      ) {
        continue;
      }
      records.push({
        name: cells[0],
        address: cells[1],
        suburb: cells[2],
        state: cells[3],
        postcode: cells[4],
        careType,
        residentialPlaces: Number.isFinite(residentialPlaces) ? residentialPlaces : null,
        provider: cells[10],
        organisationType: cells[11],
        latitude,
        longitude,
        sourceRow: `${pageNumber}:${y}`,
      });
    }
  }
  const unique = [
    ...new Map(records.map((row) => [`${row.name}|${row.address}|${row.latitude}`, row])).values(),
  ];
  const tuples = unique.map((row) => {
    const sourceKey = `${row.name}|${row.address}|${row.suburb}|${row.latitude}|${row.longitude}`;
    return `(${quote(uuid(sourceKey))},${quote(sourceKey)},${quote(row.name)},${quote(row.provider)},${quote(row.address)},${quote(row.suburb)},${quote(row.state)},${quote(row.postcode)},${quote(row.careType)},${number(row.residentialPlaces)},${row.latitude},${row.longitude},${quote(row.organisationType)},${quote(row.sourceRow)})`;
  });
  const template = await readFile(
    new URL("./templates/wp22-healthcare-anchors.sql", import.meta.url),
    "utf8",
  );
  await writeFile(
    output,
    template
      .replaceAll("__SOURCE_URL__", SOURCE_URL)
      .replaceAll("__SOURCE_SHA256__", checksum)
      .replaceAll("__ROW_COUNT__", String(unique.length))
      .replace("__AGED_CARE_ROWS__", tuples.join(",\n")),
  );
  console.log(`Wrote ${unique.length} Victorian residential aged-care anchors`);
  console.log(`Source sha256 ${checksum}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
