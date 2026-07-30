import { describe, expect, it } from "vitest";
import {
  deduplicateStatewideResults,
  hasVerifiedSearchCoordinates,
  type StatewideSearchResult,
} from "../src/lib/statewide-search";

function result(overrides: Partial<StatewideSearchResult> = {}): StatewideSearchResult {
  return {
    result_type: "pharmacy",
    result_id: "00000000-0000-4000-8000-000000000001",
    result_name: "Example Pharmacy",
    result_address: "1 Example Street",
    result_suburb: "Melbourne",
    result_postcode: "3000",
    lat: -37.81,
    lng: 144.96,
    source_confidence: "high",
    is_private: false,
    relevance: 0.8,
    ...overrides,
  };
}

describe("VPA statewide-search hardening", () => {
  it("deduplicates public and VPA results by canonical premises ID", () => {
    const deduplicated = deduplicateStatewideResults([
      result(),
      result({
        result_type: "vpa_pharmacy",
        result_name: "Official Example Pharmacy",
        registration_source_status: "authoritative_source",
        relevance: 0.9,
      }),
    ]);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]).toMatchObject({
      result_type: "vpa_pharmacy",
      result_name: "Official Example Pharmacy",
      registration_source_status: "authoritative_source",
      source_confidence: "high",
    });
  });

  it.each([
    ["null latitude", null, 144.96],
    ["null longitude", -37.81, null],
    ["non-finite latitude", Number.NaN, 144.96],
    ["non-finite longitude", -37.81, Number.POSITIVE_INFINITY],
    ["outside Victoria", -20, 144.96],
  ])("rejects %s for map fly-to", (_label, lat, lng) => {
    expect(hasVerifiedSearchCoordinates(result({ lat, lng }))).toBe(false);
  });

  it("allows a coordinate-less pharmacy result to retain its profile identity", () => {
    const coordinateLess = result({ lat: null, lng: null });
    expect(coordinateLess.result_id).toBeTruthy();
    expect(["pharmacy", "vpa_pharmacy"]).toContain(coordinateLess.result_type);
    expect(hasVerifiedSearchCoordinates(coordinateLess)).toBe(false);
  });
});
