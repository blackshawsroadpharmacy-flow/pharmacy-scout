#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "PharmacyScoutImporter/0.1 (contact: local-repo-script)";
const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "data", "import-cache");
const OUTPUT_DIR = path.join(ROOT, "data", "import-output");

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error(
      "Usage: node scripts/import-vic-pharmacies.mjs <community_pharmacies_victoria.csv>",
    );
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const csvText = await fs.readFile(path.resolve(csvPath), "utf8");
  const rows = parseCsv(csvText);
  const output = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const query = buildQuery(row);
    const geocode = await geocodeAddress(query, row.suburb, row.postcode);
    output.push({
      pharmacyname: row.pharmacyname,
      address: row.address,
      suburb: row.suburb,
      postcode: row.postcode,
      phone: row.phone || null,
      website: row.website || null,
      source: "community_pharmacies_victoria_csv",
      source_confidence: geocode.confidence,
      geocode_method: geocode.method,
      latitude: geocode.lat,
      longitude: geocode.lng,
      geocode_query: query,
    });

    process.stderr.write(`\rProcessed ${index + 1}/${rows.length}`);
    await delay(1000);
  }

  process.stderr.write("\n");
  const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const outPath = path.join(OUTPUT_DIR, `vic-pharmacies-enriched-${timestamp}.json`);
  await fs.writeFile(outPath, JSON.stringify(output, null, 2));
  process.stdout.write(`${outPath}\n`);
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = splitCsvLine(lines.shift() ?? "");
  return lines.map((line) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      pharmacyname: row.pharmacyname?.trim() ?? "",
      address: row.address?.trim() ?? "",
      suburb: row.suburb?.trim() ?? "",
      postcode: row.postcode?.trim() ?? "",
      phone: row.phone?.trim() ?? "",
      website: row.website?.trim() ?? "",
    };
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function buildQuery(row) {
  return `${row.address}, ${row.suburb} VIC ${row.postcode}, Australia`;
}

async function geocodeAddress(fullQuery, suburb, postcode) {
  const exact = await geocodeWithNominatim(fullQuery);
  if (exact) return { ...exact, method: "nominatim_exact" };

  const photon = await geocodeWithPhoton(fullQuery);
  if (photon) return { ...photon, method: "photon_exact" };

  const suburbQuery = `${suburb} VIC ${postcode}, Australia`;
  const suburbHit =
    (await geocodeWithNominatim(suburbQuery)) || (await geocodeWithPhoton(suburbQuery));
  if (suburbHit) {
    return {
      ...suburbHit,
      method: "suburb_centroid",
      confidence: "approximate",
    };
  }

  return {
    lat: null,
    lng: null,
    confidence: "failed",
    method: "failed",
  };
}

async function geocodeWithNominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const result = await cachedJson(`nominatim-${hash(query)}.json`, url);
  const hit = Array.isArray(result) ? result[0] : null;
  if (!hit?.lat || !hit?.lon) return null;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    confidence: "high",
  };
}

async function geocodeWithPhoton(query) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  const result = await cachedJson(`photon-${hash(query)}.json`, url);
  const coords = result?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return {
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    confidence: "medium",
  };
}

async function cachedJson(fileName, url) {
  const filePath = path.join(CACHE_DIR, fileName);
  try {
    const existing = await fs.readFile(filePath, "utf8");
    return JSON.parse(existing);
  } catch {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    const body = await response.text();
    await fs.writeFile(filePath, body);
    return JSON.parse(body);
  }
}

function hash(value) {
  let hashValue = 0;
  for (let i = 0; i < value.length; i += 1) {
    hashValue = (hashValue << 5) - hashValue + value.charCodeAt(i);
    hashValue |= 0;
  }
  return String(Math.abs(hashValue));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
