import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCoverageReport,
  normalizePhone,
  normalizeRow,
  normalizeWebsite,
  parseCsv,
} from "../scripts/lib/vic-pharmacy-import.mjs";

test("parseCsv keeps all supplied rows including empty website fields", () => {
  const csv = [
    "pharmacyname,address,suburb,postcode,phone,website",
    'Alpha Pharmacy,"1 Main Street",Melbourne,3000,312345678,',
    'Beta Pharmacy,"2 Side Street",Geelong,3220,412345678,www.example.com',
  ].join("\n");

  const rows = parseCsv(csv);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].website, "");
  assert.equal(rows[1].website, "www.example.com");
});

test("normalizePhone restores leading zero for known Australian patterns", () => {
  assert.deepEqual(normalizePhone("312345678"), {
    normalized: "0312345678",
    warning: "Prepended leading zero to Australian phone number: 312345678",
  });
  assert.deepEqual(normalizePhone("412345678"), {
    normalized: "0412345678",
    warning: "Prepended leading zero to Australian phone number: 412345678",
  });
});

test("normalizeWebsite prepends https only for clear hostnames", () => {
  assert.deepEqual(normalizeWebsite("example.com"), {
    normalized: "https://example.com",
    warning: "Prepended https:// to website: example.com",
  });
  assert.deepEqual(normalizeWebsite("https://chemist.example"), {
    normalized: "https://chemist.example",
    warning: null,
  });
});

test("normalizeRow is deterministic across repeated runs", () => {
  const row = {
    pharmacyname: "Alpha Pharmacy",
    address: "Shop 2, 1 Main Street",
    suburb: "Melbourne",
    postcode: "3000",
    phone: "312345678",
    website: "example.com",
  };

  const first = normalizeRow(row, 1);
  const second = normalizeRow(row, 1);

  assert.deepEqual(first, second);
  assert.equal(first.matching_key, "ALPHA PHARMACY|SHP 2 1 MAIN ST|3000");
});

test("buildCoverageReport counts exact, approximate, and failed outcomes", () => {
  const report = buildCoverageReport([
    {
      source_confidence: "high",
      geocode_method: "nominatim_exact",
      data_quality_warnings: [],
    },
    {
      source_confidence: "medium",
      geocode_method: "photon_exact",
      data_quality_warnings: ["Prepended https:// to website: example.com"],
    },
    {
      source_confidence: "approximate",
      geocode_method: "suburb_centroid",
      data_quality_warnings: ["Prepended leading zero to Australian phone number: 312345678"],
    },
    {
      source_confidence: "failed",
      geocode_method: "failed",
      data_quality_warnings: ["Ambiguous phone format retained without reinterpretation: 123"],
    },
  ]);

  assert.equal(report.total_rows, 4);
  assert.deepEqual(report.geocode_counts, {
    exact_high: 1,
    exact_medium: 1,
    approximate: 1,
    failed: 1,
  });
  assert.equal(report.method_counts.nominatim_exact, 1);
  assert.equal(report.method_counts.suburb_centroid, 1);
  assert.equal(report.phone_repairs, 1);
  assert.equal(report.website_repairs, 1);
  assert.equal(report.warning_rows, 3);
});
