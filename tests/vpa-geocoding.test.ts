import { describe, expect, it } from "vitest";
import { validateVpaGeocode, type VpaGeocodeCandidate } from "../src/lib/vpa-geocoding";

const candidate: VpaGeocodeCandidate = {
  queryAddress: "1 Test Street, Melbourne VIC 3000",
  normalisedAddress: "1 test st melbourne vic 3000",
  provider: "authoritative_fixture",
  providerResultId: "fixture-1",
  latitude: -37.8136,
  longitude: 144.9631,
  returnedAddress: "1 Test Street, Melbourne VIC 3000",
  returnedSuburb: "Melbourne",
  returnedPostcode: "3000",
  accuracyType: "address",
  confidence: 0.98,
};

describe("VPA geocode validation", () => {
  it("accepts a high-confidence Victorian address result", () => {
    expect(validateVpaGeocode(candidate, { suburb: "Melbourne", postcode: "3000" })).toEqual({
      state: "validated",
      reasons: [],
    });
  });

  it("quarantines out-of-state, postcode-conflicting and centroid results", () => {
    const result = validateVpaGeocode(
      {
        ...candidate,
        latitude: -33.8688,
        longitude: 151.2093,
        returnedPostcode: "2000",
        accuracyType: "suburb",
      },
      { suburb: "Melbourne", postcode: "3000" },
    );
    expect(result.state).toBe("quarantined");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["outside_victoria", "postcode_conflict", "centroid_only"]),
    );
  });

  it("keeps missing coordinates explicitly unresolved", () => {
    expect(
      validateVpaGeocode(
        { ...candidate, latitude: null, longitude: null },
        { suburb: "Melbourne", postcode: "3000" },
      ),
    ).toEqual({ state: "unresolved", reasons: ["missing_coordinate"] });
  });
});
