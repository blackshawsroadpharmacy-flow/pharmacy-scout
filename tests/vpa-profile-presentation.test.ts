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

  it("uses due-today and neutral passed-date wording", () => {
    expect(vpaRegistrationDueWording("2026-07-30", new Date("2026-07-30T00:00:00Z"))).toContain(
      "due today",
    );
    expect(vpaRegistrationDueWording("2026-07-29", new Date("2026-07-30T00:00:00Z"))).toContain(
      "has passed",
    );
  });

  it("renders no fabricated licensee when the source lists none", () => {
    expect(registeredLicenseeSummary(0)).toContain("None has been inferred");
  });

  it("uses neutral registered-licensee terminology for multiple names", () => {
    expect(registeredLicenseeSummary(2)).toBe("2 registered licensees are currently listed.");
  });

  it("distinguishes permission and availability failures from an empty register result", () => {
    expect(registeredLicenseeSummary(0, "sign_in_required")).toContain("Sign in");
    expect(registeredLicenseeSummary(0, "unavailable")).toContain("temporarily unavailable");
    expect(registeredLicenseeSummary(0, "loaded")).toContain("No registered licensee");
  });
});
