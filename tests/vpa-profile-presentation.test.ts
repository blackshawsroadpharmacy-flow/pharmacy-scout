import { describe, expect, it } from "vitest";
import {
  registeredLicenseeSummary,
  vpaRegistrationDueWording,
} from "../src/lib/vpa-profile-presentation";

describe("VPA profile presentation", () => {
  it("uses careful registration-date wording without predicting closure", () => {
    const wording = vpaRegistrationDueWording("2026-08-15", new Date("2026-07-30T00:00:00Z"));
    expect(wording).toContain("Confirm current renewal status");
    expect(wording).not.toContain("closure");
    expect(wording).not.toContain("risk");
  });

  it("renders no fabricated licensee when the source lists none", () => {
    expect(registeredLicenseeSummary(0)).toContain("None has been inferred");
  });

  it("uses neutral registered-licensee terminology for multiple names", () => {
    expect(registeredLicenseeSummary(2)).toBe("2 registered licensees are currently listed.");
  });
});
