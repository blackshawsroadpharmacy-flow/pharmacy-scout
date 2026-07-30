export type VpaGeocodeCandidate = {
  queryAddress: string;
  normalisedAddress: string;
  provider: string;
  providerResultId: string;
  latitude: number | null;
  longitude: number | null;
  returnedAddress: string;
  returnedSuburb?: string | null;
  returnedPostcode?: string | null;
  accuracyType: string;
  confidence: number | null;
};

export type VpaGeocodeValidation = {
  state: "validated" | "quarantined" | "unresolved";
  reasons: string[];
};

const VICTORIA = { minLat: -39.3, maxLat: -33.9, minLng: 140.8, maxLng: 150.1 };
const CENTROID_TYPES = new Set(["postcode", "postal_code", "suburb", "locality", "region"]);

function comparable(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateVpaGeocode(
  candidate: VpaGeocodeCandidate,
  expected: { suburb: string; postcode: string },
): VpaGeocodeValidation {
  const reasons: string[] = [];
  if (
    candidate.latitude === null ||
    candidate.longitude === null ||
    (candidate.latitude === 0 && candidate.longitude === 0)
  ) {
    return { state: "unresolved", reasons: ["missing_coordinate"] };
  }
  if (
    candidate.latitude < VICTORIA.minLat ||
    candidate.latitude > VICTORIA.maxLat ||
    candidate.longitude < VICTORIA.minLng ||
    candidate.longitude > VICTORIA.maxLng
  ) {
    reasons.push("outside_victoria");
  }
  if (CENTROID_TYPES.has(comparable(candidate.accuracyType))) {
    reasons.push("centroid_only");
  }
  if (
    candidate.returnedPostcode &&
    comparable(candidate.returnedPostcode) !== comparable(expected.postcode)
  ) {
    reasons.push("postcode_conflict");
  }
  if (
    candidate.returnedSuburb &&
    comparable(candidate.returnedSuburb) !== comparable(expected.suburb)
  ) {
    reasons.push("suburb_conflict");
  }
  if (candidate.confidence === null || candidate.confidence < 0.8) {
    reasons.push("low_confidence");
  }
  return reasons.length ? { state: "quarantined", reasons } : { state: "validated", reasons: [] };
}
