#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  buildCoverageReport,
  collapseWhitespace,
  normalizeRow,
  parseCsv,
  PHARMACY_SOURCE,
  normalizeMatchText,
} from "./lib/vic-pharmacy-import.mjs";

const USER_AGENT = "PharmacyScoutImporter/0.2 (contact: local-repo-script)";
const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "data", "import-cache");
const OUTPUT_DIR = path.join(ROOT, "data", "import-output");
const EXACT_DELAY_MS = 1000;

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
    const rawRow = rows[index];
    const normalized = normalizeRow(rawRow, index + 1);
    const geocode = await geocodeAddress(normalized);

    output.push({
      ...normalized,
      source: PHARMACY_SOURCE,
      source_confidence: geocode.confidence,
      geocode_method: geocode.method,
      geocode_provider: geocode.provider,
      latitude: geocode.lat,
      longitude: geocode.lng,
      geocode_query: geocode.query,
      geocode_returned_address: geocode.returnedAddress,
      geocode_state: geocode.state,
      geocode_is_victoria: geocode.isVictoria,
      geocode_quality_flags: geocode.flags,
    });

    process.stderr.write(`\rProcessed ${index + 1}/${rows.length}`);
    if (geocode.needsDelay) {
      await delay(EXACT_DELAY_MS);
    }
  }

  process.stderr.write("\n");

  const coverage = buildCoverageReport(output);
  const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
  const enrichedPath = path.join(OUTPUT_DIR, `vic-pharmacies-enriched-${timestamp}.json`);
  const reportPath = path.join(OUTPUT_DIR, `vic-pharmacies-coverage-${timestamp}.json`);

  await fs.writeFile(enrichedPath, JSON.stringify(output, null, 2));
  await fs.writeFile(reportPath, JSON.stringify(coverage, null, 2));

  process.stdout.write(`${enrichedPath}\n${reportPath}\n`);
}

function buildQuery(row) {
  return `${row.address}, ${row.suburb} VIC ${row.postcode}, Australia`;
}

async function geocodeAddress(row) {
  const exactQuery = buildQuery(row);

  const exactNominatim = await geocodeWithNominatim(exactQuery);
  if (isUsableVictoriaHit(exactNominatim)) {
    return {
      ...exactNominatim,
      query: exactQuery,
      confidence: "high",
      method: "nominatim_exact",
      flags: [],
      needsDelay: !exactNominatim.fromCache,
    };
  }

  const exactPhoton = await geocodeWithPhoton(exactQuery);
  if (isUsableVictoriaHit(exactPhoton)) {
    return {
      ...exactPhoton,
      query: exactQuery,
      confidence: "medium",
      method: "photon_exact",
      flags: [],
      needsDelay: !exactPhoton.fromCache,
    };
  }

  const suburbQuery = `${row.suburb} VIC ${row.postcode}, Australia`;
  const suburbHit =
    (await geocodeWithNominatim(suburbQuery)) || (await geocodeWithPhoton(suburbQuery));

  if (isUsableVictoriaHit(suburbHit)) {
    return {
      ...suburbHit,
      query: suburbQuery,
      confidence: "approximate",
      method: "suburb_centroid",
      flags: ["suburb_centroid_fallback"],
      needsDelay: !suburbHit.fromCache,
    };
  }

  return {
    lat: null,
    lng: null,
    provider: "none",
    returnedAddress: null,
    state: null,
    isVictoria: false,
    query: exactQuery,
    confidence: "failed",
    method: "failed",
    flags: ["geocode_failed"],
    needsDelay: false,
  };
}

function isUsableVictoriaHit(hit) {
  return Boolean(hit?.lat && hit?.lng && hit.isVictoria);
}

async function geocodeWithNominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "au");
  url.searchParams.set("limit", "1");

  const result = await cachedJson(`nominatim-${hash(query)}.json`, url);
  const hit = Array.isArray(result.body) ? result.body[0] : null;
  if (!hit?.lat || !hit?.lon) return null;

  const state = collapseWhitespace(hit.address?.state ?? "");
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    provider: "nominatim",
    returnedAddress: hit.display_name ?? null,
    state: state || null,
    isVictoria: isVictoriaState(state) || isVictoriaDisplayName(hit.display_name),
    fromCache: result.fromCache,
  };
}

async function geocodeWithPhoton(query) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "en");

  const result = await cachedJson(`photon-${hash(query)}.json`, url);
  const feature = result.body?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const state = collapseWhitespace(
    feature?.properties?.state ?? feature?.properties?.county ?? feature?.properties?.region ?? "",
  );
  const returnedAddress = [
    feature?.properties?.name,
    feature?.properties?.street,
    feature?.properties?.suburb,
    feature?.properties?.city,
    feature?.properties?.state,
    feature?.properties?.postcode,
    feature?.properties?.country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    provider: "photon",
    returnedAddress: returnedAddress || null,
    state: state || null,
    isVictoria: isVictoriaState(state) || isVictoriaDisplayName(returnedAddress),
    fromCache: result.fromCache,
  };
}

function isVictoriaState(value) {
  const normalized = normalizeMatchText(value);
  return normalized === "VICTORIA" || normalized === "VIC";
}

function isVictoriaDisplayName(value) {
  const normalized = normalizeMatchText(value ?? "");
  return normalized.includes(" VICTORIA ") || normalized.endsWith(" VICTORIA");
}

async function cachedJson(fileName, url) {
  const filePath = path.join(CACHE_DIR, fileName);
  try {
    const existing = await fs.readFile(filePath, "utf8");
    return { body: JSON.parse(existing), fromCache: true };
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
    return { body: JSON.parse(body), fromCache: false };
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
