import { createHash } from "node:crypto";

export const SOURCE_KEY = "osm-overpass-victoria";
export const VIC_BOUNDS = { south: -39.3, north: -33.8, west: 140.8, east: 150.1 };

export function normaliseText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function deterministicSourceId(element) {
  if (!element?.type || !Number.isSafeInteger(element?.id)) return null;
  return `osm:${element.type}:${element.id}`;
}

export function coordinatesFor(element) {
  const lat = element?.lat ?? element?.center?.lat;
  const lng = element?.lon ?? element?.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    method: element.type === "node" ? "source_point" : "source_geometry_centroid",
    confidence: element.type === "node" ? 0.9 : 0.72,
  };
}

export function isVictorianCoordinate(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= VIC_BOUNDS.south &&
    lat <= VIC_BOUNDS.north &&
    lng >= VIC_BOUNDS.west &&
    lng <= VIC_BOUNDS.east
  );
}

export function addressFor(tags = {}) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return (
    [street, tags["addr:suburb"] ?? tags["addr:city"], tags["addr:postcode"], tags["addr:state"]]
      .filter(Boolean)
      .join(", ") || null
  );
}

function servicesFor(tags) {
  const values = [tags.healthcare, tags.amenity, tags.speciality, tags["healthcare:speciality"]]
    .flatMap((value) => String(value ?? "").split(";"))
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? [...new Set(values)] : null;
}

export function mapElement(category, element, fetchedAt = new Date().toISOString()) {
  const sourceRecordId = deterministicSourceId(element);
  const coordinate = coordinatesFor(element);
  const tags = element?.tags ?? {};
  const name = tags.name ?? tags.brand ?? tags.operator ?? null;
  const address = addressFor(tags);
  const rawPayload = element;
  const recordHash = createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");

  const rejected = [];
  if (!sourceRecordId) rejected.push("missing_source_identifier");
  if (!coordinate) rejected.push("invalid_coordinates");
  else if (!isVictorianCoordinate(coordinate.lat, coordinate.lng)) rejected.push("out_of_state");
  if (!name) rejected.push("missing_name");

  const common = {
    source_record_id: sourceRecordId,
    source_url: sourceRecordId
      ? `https://www.openstreetmap.org/${element.type}/${element.id}`
      : null,
    fetched_at: fetchedAt,
    observed_at: null,
    raw_payload: rawPayload,
    record_hash: recordHash,
    name,
    normalised_name: normaliseText(name),
    address,
    normalised_address: normaliseText(address) || null,
    lat: coordinate?.lat ?? null,
    lng: coordinate?.lng ?? null,
    coordinate_method: coordinate?.method ?? null,
    coordinate_confidence: coordinate?.confidence ?? null,
    verification_status: "unverified",
    licence_status: "approved",
    geographic_coverage: "Victoria, Australia; OpenStreetMap community coverage varies",
    rejection_reasons: rejected,
  };

  if (category === "supermarkets") {
    return {
      ...common,
      trading_name: tags["official_name"] ?? null,
      brand: tags.brand ?? null,
      opening_hours: tags.opening_hours ?? null,
      floor_area_sqm: null,
      floor_area_source: null,
    };
  }
  if (category === "medical_centres") {
    return {
      ...common,
      trading_name: tags["official_name"] ?? null,
      services: servicesFor(tags),
      opening_hours: tags.opening_hours ?? null,
      known_practitioners: null,
      practitioner_evidence_source: null,
    };
  }
  throw new Error(`Unsupported category: ${category}`);
}

export function deduplicate(records) {
  const accepted = [];
  const rejected = [];
  const duplicateCandidates = [];
  const bySourceId = new Map();
  const byMatchKey = new Map();

  for (const record of records) {
    if (record.rejection_reasons.length) {
      rejected.push(record);
      continue;
    }
    if (bySourceId.has(record.source_record_id)) {
      rejected.push({ ...record, rejection_reasons: ["duplicate_source_identifier"] });
      continue;
    }
    bySourceId.set(record.source_record_id, record);
    const matchKey = `${record.normalised_name}|${record.normalised_address ?? ""}`;
    const existing = byMatchKey.get(matchKey);
    if (existing && matchKey !== "|") {
      duplicateCandidates.push({
        incumbent_source_record_id: existing.source_record_id,
        incoming_source_record_id: record.source_record_id,
        match_key: matchKey,
      });
    } else {
      byMatchKey.set(matchKey, record);
    }
    accepted.push(record);
  }
  return { accepted, rejected, duplicateCandidates };
}

export function overpassQuery(category) {
  const selectors =
    category === "supermarkets"
      ? ['nwr["shop"="supermarket"](area.searchArea);']
      : [
          'nwr["amenity"="clinic"](area.searchArea);',
          'nwr["amenity"="doctors"](area.searchArea);',
          'nwr["healthcare"="clinic"](area.searchArea);',
          'nwr["healthcare"="centre"](area.searchArea);',
          'nwr["healthcare"="doctor"](area.searchArea);',
        ];
  return `[out:json][timeout:240];area["ISO3166-2"="AU-VIC"][boundary=administrative]->.searchArea;(${selectors.join("")});out center tags;`;
}

export async function fetchOverpass(
  category,
  { endpoint = "https://overpass-api.de/api/interpreter", fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "ChemistAcquisitionsLocationIntelligence/1.0",
    },
    body: new URLSearchParams({ data: overpassQuery(category) }),
  });
  if (!response.ok) throw new Error(`Overpass request failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.elements)) throw new Error("Overpass response has no elements array");
  return payload;
}

export function prepareImport(category, payload, fetchedAt = new Date().toISOString()) {
  const mapped = payload.elements.map((element) => mapElement(category, element, fetchedAt));
  const result = deduplicate(mapped);
  return {
    ...result,
    metrics: {
      fetched_count: mapped.length,
      imported_count: result.accepted.length,
      rejected_count: result.rejected.length,
      duplicate_candidate_count: result.duplicateCandidates.length,
      conflict_count: 0,
      stale_count: 0,
      exact_geocode_count: result.accepted.filter((r) => r.coordinate_method === "source_point")
        .length,
      approximate_geocode_count: result.accepted.filter(
        (r) => r.coordinate_method === "source_geometry_centroid",
      ).length,
    },
  };
}
