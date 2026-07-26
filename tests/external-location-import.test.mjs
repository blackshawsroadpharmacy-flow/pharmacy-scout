import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicSourceId,
  isVictorianCoordinate,
  mapElement,
  normaliseText,
  prepareImport,
} from "../scripts/lib/external-location-import.mjs";

const supermarket = {
  type: "node",
  id: 42,
  lat: -37.81,
  lon: 144.96,
  tags: {
    name: "Example & Sons Supermarket",
    brand: "Example",
    "addr:housenumber": "1",
    "addr:street": "Main Street",
    "addr:suburb": "Melbourne",
    "addr:postcode": "3000",
  },
};

test("deterministic source keys are stable and reject missing identifiers", () => {
  assert.equal(deterministicSourceId(supermarket), "osm:node:42");
  assert.equal(deterministicSourceId({ type: "node" }), null);
});

test("normalisation is deterministic", () => {
  assert.equal(normaliseText("  Example & Sons! "), "example and sons");
});

test("invalid and out-of-state coordinates are quarantined", () => {
  assert.equal(isVictorianCoordinate(-37.8, 144.9), true);
  assert.equal(isVictorianCoordinate(-33.1, 151.2), false);
  const invalid = mapElement("supermarkets", { ...supermarket, lat: null, lon: null });
  assert.ok(invalid.rejection_reasons.includes("invalid_coordinates"));
  const interstate = mapElement("supermarkets", { ...supermarket, lat: -33.86, lon: 151.2 });
  assert.ok(interstate.rejection_reasons.includes("out_of_state"));
});

test("unknown values remain null rather than zero or false", () => {
  const mapped = mapElement("supermarkets", supermarket);
  assert.equal(mapped.floor_area_sqm, null);
  assert.equal(mapped.floor_area_source, null);
  const clinic = mapElement("medical_centres", {
    ...supermarket,
    id: 43,
    tags: { name: "Example Clinic", amenity: "doctors" },
  });
  assert.equal(clinic.known_practitioners, null);
  assert.equal(clinic.practitioner_evidence_source, null);
});

test("imports are idempotent and retain duplicate candidates", () => {
  const sameBusiness = {
    ...supermarket,
    type: "way",
    id: 99,
    center: { lat: supermarket.lat, lon: supermarket.lon },
    lat: undefined,
    lon: undefined,
  };
  const first = prepareImport("supermarkets", { elements: [supermarket, sameBusiness] });
  const second = prepareImport("supermarkets", { elements: [supermarket, sameBusiness] });
  assert.deepEqual(
    first.accepted.map((r) => r.source_record_id),
    second.accepted.map((r) => r.source_record_id),
  );
  assert.equal(first.duplicateCandidates.length, 1);
  assert.equal(first.metrics.imported_count, 2);
});
