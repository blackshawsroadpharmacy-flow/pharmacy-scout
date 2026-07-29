import { describe, expect, it } from "vitest";
import snapshot from "../data/source/vpa-register-2026-07-29-live.records.json";
import {
  authorizeVpaAdmin,
  isVpaRefreshEnabled,
  vpaRefreshDisabledResponse,
} from "../src/lib/vpa-refresh.server";
import { authenticateAdminRequest } from "../src/routes/api.vpa.refresh";
import {
  canonicalPremisesKey,
  normaliseVpaRegistrationStatus,
  prepareVpaRefresh,
  staleVpaPremises,
  validateVpaRefreshCoverage,
  type ExistingPremises,
  type VpaRecord,
} from "../src/lib/vpa-refresh";
import { normaliseAddress } from "../scripts/lib/vpa-register-parse.mjs";

describe("VPA refresh planner", () => {
  it("plans the complete supplied register without hard-deleting premises", () => {
    const records = snapshot.records as VpaRecord[];
    const first = records[0];
    const address = normaliseAddress(first.address_lines);
    const existing: ExistingPremises[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: first.premises_name,
        address: address.street,
        suburb: address.suburb,
        postcode: address.postcode,
        vpa_record_key: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Previously registered pharmacy",
        address: "1 Closed Street",
        suburb: "Melbourne",
        postcode: "3000",
        vpa_record_key: canonicalPremisesKey({
          name: "Previously registered pharmacy",
          street: "1 Closed Street",
          suburb: "Melbourne",
          postcode: "3000",
        }),
      },
    ];

    const prepared = prepareVpaRefresh(
      records,
      existing,
      "10000000-0000-4000-8000-000000000001",
      "2026-07-29T13:34:38.613Z",
    );
    const stale = staleVpaPremises(existing, prepared.currentKeys);

    expect(prepared.premises).toHaveLength(1606);
    // The snapshot's 2,436 CSV rows comprise 2,423 named licensees plus
    // one premises-only row for each of the 13 records with no licensee.
    expect(prepared.licensees).toHaveLength(2423);
    expect(
      prepared.licensees.length +
        records.filter((record) => (record.licensees ?? []).length === 0).length,
    ).toBe(2436);
    expect(prepared.premisesUpdated).toBe(1);
    expect(prepared.premisesAdded).toBe(1605);
    expect(stale.map((row) => row.id)).toEqual(["00000000-0000-4000-8000-000000000002"]);

    const refreshedExisting = prepared.premises.map((row): ExistingPremises => ({
      id: String(row.id),
      name: String(row.name),
      address: String(row.address),
      suburb: row.suburb ? String(row.suburb) : null,
      postcode: row.postcode ? String(row.postcode) : null,
      vpa_record_key: String(row.vpa_record_key),
    }));
    const second = prepareVpaRefresh(
      records,
      refreshedExisting,
      "10000000-0000-4000-8000-000000000001",
      "2026-07-30T13:34:38.613Z",
    );

    expect(second.premisesAdded).toBe(0);
    expect(second.premisesUpdated).toBe(1606);
    expect(second.premises.map((row) => row.id)).toEqual(prepared.premises.map((row) => row.id));
  });

  it("keeps source registration status separate from source verification", () => {
    const records = snapshot.records as VpaRecord[];
    const prepared = prepareVpaRefresh(
      records,
      [],
      "10000000-0000-4000-8000-000000000001",
      "2026-07-29T13:34:38.613Z",
    );
    const closed = prepared.premises.find(
      (row) => row.vpa_registration_status_normalised === "closed",
    );
    expect(closed?.vpa_registration_status_raw).toBe("Closed");
    expect(closed?.vpa_source_verification_status).toBe("authoritative_source");
    expect(closed).not.toHaveProperty("vpa_registration_status", "verified");
    expect(prepared.premises[0]).toHaveProperty("published_licensee_names");
    expect(prepared.premises[0]).not.toHaveProperty("proprietor_names");
  });

  it.each([
    ["Active", "active"],
    ["Closed", "closed"],
    ["Suspended", "suspended"],
    ["Unexpected source value", "review_required"],
    [undefined, "unknown"],
  ])("normalises only explicit registration states: %s", (raw, expected) => {
    expect(normaliseVpaRegistrationStatus(raw)).toBe(expected);
  });

  it("rejects incomplete, capped, errored, undersized and duplicate snapshots", () => {
    const records = (snapshot.records as VpaRecord[]).slice(0, 100);
    const duplicate = [...records, records[0]];
    const failures = validateVpaRefreshCoverage({
      records: duplicate,
      postcodesQueried: 999,
      capWarnings: 1,
      errors: ["postcode 3999 failed"],
      baselineCount: 1606,
    });
    expect(failures).toHaveLength(5);
    expect(failures.join(" ")).toContain("Expected 1000");
    expect(failures.join(" ")).toContain("result cap");
    expect(failures.join(" ")).toContain("errors");
    expect(failures.join(" ")).toContain("safe minimum");
    expect(failures.join(" ")).toContain("duplicate VPA source keys");
  });

  it("accepts the complete supplied baseline", () => {
    expect(
      validateVpaRefreshCoverage({
        records: snapshot.records as VpaRecord[],
        postcodesQueried: 1000,
        capWarnings: 0,
        errors: [],
        baselineCount: null,
      }),
    ).toEqual([]);
  });
});

describe("VPA admin gate", () => {
  it("fails closed unless the server-only enable flag is exactly true", async () => {
    expect(isVpaRefreshEnabled({})).toBe(false);
    expect(isVpaRefreshEnabled({ VPA_REFRESH_ENABLED: "false" })).toBe(false);
    expect(isVpaRefreshEnabled({ VPA_REFRESH_ENABLED: "true" })).toBe(true);
    const response = vpaRefreshDisabledResponse({});
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: expect.stringContaining("temporarily disabled"),
    });
    expect(vpaRefreshDisabledResponse({ VPA_REFRESH_ENABLED: "true" })).toBeNull();
  });

  it("rejects a refresh request without an authenticated session", async () => {
    const response = await authenticateAdminRequest(
      new Request("https://example.test/api/vpa/refresh", { method: "POST" }),
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  it.each([
    [{ id: "role-id" }, true],
    [null, false],
  ])("returns %s only when the admin role row exists", async (role, expected) => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: role, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    await expect(authorizeVpaAdmin(client as never, "user-id")).resolves.toBe(expected);
  });
});
