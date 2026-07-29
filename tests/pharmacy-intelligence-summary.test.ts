import { describe, expect, it } from "vitest";
import { pharmacyIntelligenceSummary } from "../src/lib/pharmacy-intelligence-summary";

describe("pharmacyIntelligenceSummary", () => {
  it("formats the model central estimate and strongest sourced insight", () => {
    expect(
      pharmacyIntelligenceSummary({
        experimental_scripts_day: 217.6,
        principal_reason: "Strong catchment population",
      }),
    ).toEqual({
      estimateLabel: "218 estimated scripts/day",
      topInsight: "Strong catchment population",
    });
  });

  it.each([null, undefined, Number.NaN])(
    "does not fabricate a zero estimate for %s",
    (experimental_scripts_day) => {
      expect(
        pharmacyIntelligenceSummary({
          experimental_scripts_day,
          principal_reason: null,
        }),
      ).toEqual({
        estimateLabel: null,
        topInsight: null,
      });
    },
  );

  it("does not render an insight when the source text is blank", () => {
    expect(
      pharmacyIntelligenceSummary({
        experimental_scripts_day: 0,
        principal_reason: "   ",
      }),
    ).toEqual({
      estimateLabel: "0 estimated scripts/day",
      topInsight: null,
    });
  });
});
