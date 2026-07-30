import assert from "node:assert/strict";
import test from "node:test";
import {
  auditVpaRows,
  classifyPremisesMatch,
  groupVpaRows,
  parseCsv,
} from "../scripts/lib/vpa-import-staging.mjs";

const header =
  "source,scraped_at,source_url,premises_name,street_address,suburb,state,postcode,full_address,registered_until,registration_status,premises_conditions,licensee_name,licensed_until,licensee_status,licensee_conditions";
const row = (overrides = {}) => ({
  source: "vpa_public_register",
  scraped_at: "2026-07-29T13:34:38.613Z",
  source_url: "https://pharmacy.vic.gov.au/register-search/",
  premises_name: "Example Pharmacy",
  street_address: "Shop 1, 10 High Street",
  suburb: "Melbourne",
  state: "VIC",
  postcode: "3000",
  full_address: "Shop 1, 10 High Street, Melbourne VIC 3000",
  registered_until: "30/06/2027",
  registration_status: "Active",
  premises_conditions: "",
  licensee_name: "Example Licensee",
  licensed_until: "30/06/2027",
  licensee_status: "Active",
  licensee_conditions: "",
  ...overrides,
});

test("RFC4180 parsing retains quoted commas and blank licensees", () => {
  const values = Object.values(
    row({ street_address: "Shop 1, 10 High Street", licensee_name: "" }),
  );
  const csv = `${header}\n${values.map((value) => `"${value}"`).join(",")}\n`;
  const [parsed] = parseCsv(csv);
  assert.equal(parsed.street_address, "Shop 1, 10 High Street");
  assert.equal(groupVpaRows([parsed])[0].licensees.length, 0);
});

test("multiple licensees group into one premises without fabrication", () => {
  const rows = [row(), row({ licensee_name: "Second Licensee" })];
  const grouped = groupVpaRows(rows);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].licensees.length, 2);
});

test("audit preserves missing values and identifies malformed source data", () => {
  const audit = auditVpaRows([
    row(),
    row({ licensee_name: "", licensed_until: "", postcode: "999", registered_until: "31/02/2027" }),
  ]);
  assert.equal(audit.csv_rows, 2);
  assert.equal(audit.malformed_dates, 1);
  assert.equal(audit.invalid_postcodes, 1);
  assert.equal(audit.blank_fields_by_column.licensee_name, 1);
});

test("matching classifies exact address/name and likely rename", () => {
  const source = groupVpaRows([row()])[0];
  const canonical = [
    {
      id: "one",
      name: "Example Pharmacy",
      address: "10 High St",
      suburb: "Melbourne",
      postcode: "3000",
    },
  ];
  assert.equal(classifyPremisesMatch(source, canonical).disposition, "exact_match");
  assert.equal(
    classifyPremisesMatch({ ...source, premises_name: "New Trading Name" }, canonical).disposition,
    "renamed_premises_candidate",
  );
});

test("matching quarantines ambiguity and never matches by name alone", () => {
  const source = groupVpaRows([row()])[0];
  const sameAddress = [
    { id: "one", name: "A", address: "10 High St", suburb: "Melbourne", postcode: "3000" },
    { id: "two", name: "B", address: "10 High Street", suburb: "Melbourne", postcode: "3000" },
  ];
  assert.equal(classifyPremisesMatch(source, sameAddress).disposition, "ambiguous_match");
  const sameNameElsewhere = [
    {
      id: "three",
      name: "Example Pharmacy",
      address: "99 Low Rd",
      suburb: "Carlton",
      postcode: "3053",
    },
  ];
  assert.equal(
    classifyPremisesMatch(source, sameNameElsewhere).disposition,
    "relocation_candidate",
  );
});
