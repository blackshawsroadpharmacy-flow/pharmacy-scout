#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "PharmacyScoutImporter/0.2 (contact: local-repo-script)";
const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "data", "import-cache");
const OUTPUT_DIR = path.join(ROOT, "data", "import-output");
const EXACT_DELAY_MS = 1000;
const PHARMACY_SOURCE = "community_pharmacies_victoria_csv";

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
    await delay(EXACT_DELAY_MS);
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

function normalizeRow(row, rowNumber) {
  const warnings = [];
  const postcode = normalizePostcode(row.postcode, warnings);
  const phoneInfo = normalizePhone(row.phone);
  const websiteInfo = normalizeWebsite(row.website);

  if (phoneInfo.warning) warnings.push(phoneInfo.warning);
  if (websiteInfo.warning) warnings.push(websiteInfo.warning);

  const displayAddress = [row.address, row.suburb, postcode].filter(Boolean).join(", ");

  return {
    row_number: rowNumber,
    pharmacyname: row.pharmacyname,
    canonical_name: collapseWhitespace(row.pharmacyname),
    address: row.address,
    suburb: row.suburb,
    postcode,
    display_address: displayAddress,
    normalized_name: normalizeMatchText(row.pharmacyname),
    normalized_address: normalizeAddress(row.address),
    normalized_suburb: normalizeMatchText(row.suburb),
    normalized_phone: phoneInfo.normalized,
    phone: phoneInfo.normalized ?? (row.phone || null),
    phone_raw: row.phone || null,
    website: websiteInfo.normalized,
    website_raw: row.website || null,
    matching_key: [
      normalizeMatchText(row.pharmacyname),
      normalizeAddress(row.address),
      postcode || "0000",
    ].join("|"),
    data_quality_warnings: warnings,
  };
}

function normalizePostcode(value, warnings) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 4) return digits;
  warnings.push(`Unexpected postcode format: ${value}`);
  return digits.padStart(4, "0").slice(-4);
}

function normalizePhone(value) {
  const trimmed = value.trim();
  if (!trimmed) return { normalized: null, warning: null };

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return { normalized: null, warning: `Phone field is non-numeric: ${value}` };
  }

  if (digits.length === 9 && (digits.startsWith("3") || digits.startsWith("4"))) {
    return {
      normalized: `0${digits}`,
      warning: `Prepended leading zero to Australian phone number: ${value}`,
    };
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    return { normalized: digits, warning: null };
  }

  return {
    normalized: digits,
    warning: `Ambiguous phone format retained without reinterpretation: ${value}`,
  };
}

function normalizeWebsite(value) {
  const trimmed = value.trim();
  if (!trimmed) return { normalized: null, warning: null };

  if (/^https?:\/\//i.test(trimmed)) {
    return { normalized: trimmed, warning: null };
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return {
      normalized: `https://${trimmed}`,
      warning: `Prepended https:// to website: ${value}`,
    };
  }

  return {
    normalized: trimmed,
    warning: `Website retained in original form for manual review: ${value}`,
  };
}

function normalizeAddress(value) {
  return normalizeMatchText(value)
    .replace(/\bUNIT\b/g, "U")
    .replace(/\bSUITE\b/g, "STE")
    .replace(/\bSHOP\b/g, "SHP")
    .replace(/\bLEVEL\b/g, "LVL")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bPARADE\b/g, "PDE")
    .replace(/\bCRESCENT\b/g, "CRES")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bMOUNT\b/g, "MT")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMatchText(value) {
  return collapseWhitespace(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
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
  const hit = Array.isArray(result) ? result[0] : null;
  if (!hit?.lat || !hit?.lon) return null;

  const state = collapseWhitespace(hit.address?.state ?? "");
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    provider: "nominatim",
    returnedAddress: hit.display_name ?? null,
    state: state || null,
    isVictoria: isVictoriaState(state) || isVictoriaDisplayName(hit.display_name),
  };
}

async function geocodeWithPhoton(query) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "en");

  const result = await cachedJson(`photon-${hash(query)}.json`, url);
  const feature = result?.features?.[0];
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

function buildCoverageReport(rows) {
  const coverage = {
    generated_at: new Date().toISOString(),
    source: PHARMACY_SOURCE,
    total_rows: rows.length,
    geocode_counts: {
      exact_high: 0,
      exact_medium: 0,
      approximate: 0,
      failed: 0,
    },
    method_counts: {},
    phone_repairs: 0,
    website_repairs: 0,
    warning_rows: 0,
  };

  for (const row of rows) {
    if (row.source_confidence === "high") coverage.geocode_counts.exact_high += 1;
    else if (row.source_confidence === "medium") coverage.geocode_counts.exact_medium += 1;
    else if (row.source_confidence === "approximate") coverage.geocode_counts.approximate += 1;
    else coverage.geocode_counts.failed += 1;

    coverage.method_counts[row.geocode_method] =
      (coverage.method_counts[row.geocode_method] ?? 0) + 1;

    if (row.data_quality_warnings.some((warning) => warning.includes("phone number"))) {
      coverage.phone_repairs += 1;
    }
    if (row.data_quality_warnings.some((warning) => warning.includes("https://"))) {
      coverage.website_repairs += 1;
    }
    if (row.data_quality_warnings.length > 0) coverage.warning_rows += 1;
  }

  return coverage;
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
