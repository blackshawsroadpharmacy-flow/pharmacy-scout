import test from "node:test";
import assert from "node:assert/strict";
import {
  VPA_CSV_COLUMNS,
  VPA_SOURCE,
  normaliseAddress,
  parseVpaRecord,
  recordKey,
  recordToCsvRows,
  rowsToCsv,
} from "../scripts/lib/vpa-register-parse.mjs";

const SAMPLE_RECORD = `
<div class="row record">
    <div class="col-md-12">
        <div class="row">
            <div class="col-md-6 premises">
                <span class='premisesname'>Amcal Melbourne</span><br/>
                Ground Floor Retail, 92 - 94 Elizabeth Street<br/>
                Melbourne                     VIC                     3000<br/>
                <span class="registereduntil">Registered until 30/06/2027</span><br/>
                <span class="registrationstatus">Registration status: Active</span>
                <div class="condition  float-end" conditionid="01816330-b154-f111-bec7-7ced8dd1c0f9">Standard registration conditions</div>
            </div>
            <div class="col-md-6">
                <div class="licenseelabel">Licensee(s)</div>
                <div class="row licensees">
                    <div class="col-md-12 licensee mb-3">
                        <span class='licenseename'>Pharmacy O2471 Pty Ltd</span><br/>
                        <span class="licenseduntil">Licensed until 30/06/2027</span><br/>
                        <span class="licensestatus">Licence status: Active</span>
                        <span class="condition float-end" conditionid="ae5c42df-5554-f111-bec7-00224898f8f2">Standard licence condition</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

const MULTI_LICENSEE_RECORD = `
<div class="row record">
    <div class="col-md-12">
        <div class="row">
            <div class="col-md-6 premises">
                <span class='premisesname'>Chemist Warehouse Elizabeth Street Victoria Market</span><br/>
                Ground Floor, 568 - 574 Elizabeth Street<br/>
                MELBOURNE                     VIC                     3000<br/>
                <span class="registereduntil">Registered until 30/06/2027</span><br/>
                <span class="registrationstatus">Registration status: Active</span>
            </div>
            <div class="col-md-6">
                <div class="licenseelabel">Licensee(s)</div>
                <div class="row licensees">
                    <div class="col-md-12 licensee mb-3">
                        <span class='licenseename'>Anthony Bassaly</span><br/>
                        <span class="licenseduntil">Licensed until 30/06/2027</span><br/>
                        <span class="licensestatus">Licence status: Active</span>
                    </div>
                    <div class="col-md-12 licensee mb-3">
                        <span class='licenseename'>Shirley Tsui</span><br/>
                        <span class="licenseduntil">Licensed until 30/06/2027</span><br/>
                        <span class="licensestatus">Licence status: Active</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

// Mirrors the live template: the premises block contains a <div>-wrapped
// condition, not the synthetic <span>-only form used above.
const NESTED_DIV_RECORD = `
<div class="row record">
    <div class="col-md-12">
        <div class="row">
            <div class="col-md-6 premises">
                <span class='premisesname'>Amcal Melbourne</span><br/>
                Ground Floor Retail, 92 - 94 Elizabeth Street<br/>
                Melbourne                     VIC                     3000<br/>
                <span class="registereduntil">Registered until 30/06/2027</span><br/>
                <span class="registrationstatus">Registration status: Active</span>
                <div class="condition  float-end" conditionid="01816330-b154-f111-bec7-7ced8dd1c0f9">Standard registration conditions</div>
            </div>
            <div class="col-md-6">
                <div class="licenseelabel">Licensee(s)</div>
                <div class="row licensees">
                    <div class="col-md-12 licensee mb-3">
                        <span class='licenseename'>Pharmacy O2471 Pty Ltd</span><br/>
                        <span class="licenseduntil">Licensed until 30/06/2027</span><br/>
                        <span class="licensestatus">Licence status: Active</span>
                        <span class="condition float-end" conditionid="ae5c42df-5554-f111-bec7-00224898f8f2">Standard licence condition</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

test("parseVpaRecord extracts premises, status, and licensees", () => {
  const rec = parseVpaRecord(SAMPLE_RECORD);
  assert.equal(rec.premises_name, "Amcal Melbourne");
  assert.equal(rec.registration_status, "Active");
  assert.equal(rec.registered_until, "30/06/2027");
  assert.equal(rec.conditions.length, 1);
  assert.equal(rec.conditions[0].text, "Standard registration conditions");
  assert.equal(rec.licensees.length, 1);
  assert.equal(rec.licensees[0].name, "Pharmacy O2471 Pty Ltd");
  assert.equal(rec.licensees[0].licensed_until, "30/06/2027");
  assert.equal(rec.licensees[0].status, "Active");
  assert.equal(rec.licensees[0].conditions.length, 1);
});

test("parseVpaRecord returns null for non-record HTML", () => {
  assert.equal(parseVpaRecord("<div>hello world</div>"), null);
});

test("parseVpaRecord handles a nested <div> condition inside the premises block", () => {
  const rec = parseVpaRecord(NESTED_DIV_RECORD);
  assert.equal(rec.premises_name, "Amcal Melbourne");
  // The address lines should be the two physical address lines, NOT the
  // empty string that would result from the regex cutting off at the
  // nested condition div's closing tag.
  assert.deepEqual(rec.address_lines, [
    "Ground Floor Retail, 92 - 94 Elizabeth Street",
    "Melbourne                     VIC                     3000",
  ]);
  assert.equal(rec.conditions.length, 1);
  assert.equal(rec.conditions[0].text, "Standard registration conditions");
  assert.equal(rec.licensees[0].conditions.length, 1);
  assert.equal(rec.licensees[0].conditions[0].text, "Standard licence condition");
});

test("parseVpaRecord captures multiple licensees", () => {
  const rec = parseVpaRecord(MULTI_LICENSEE_RECORD);
  assert.equal(rec.licensees.length, 2);
  assert.deepEqual(
    rec.licensees.map((l) => l.name),
    ["Anthony Bassaly", "Shirley Tsui"],
  );
});

test("normaliseAddress splits street and suburb for the standard form", () => {
  const a = normaliseAddress([
    "Ground Floor Retail, 92 - 94 Elizabeth Street",
    "Melbourne                     VIC                     3000",
  ]);
  assert.equal(a.street, "Ground Floor Retail, 92 - 94 Elizabeth Street");
  assert.equal(a.suburb, "Melbourne");
  assert.equal(a.state, "VIC");
  assert.equal(a.postcode, "3000");
});

test("normaliseAddress collapses long whitespace and joins multi-line streets", () => {
  const a = normaliseAddress([
    "Lot 100, Lower Ground Floor",
    "Manchester Unity Building",
    "MELBOURNE                     VIC                     3000",
  ]);
  assert.equal(a.street, "Lot 100, Lower Ground Floor, Manchester Unity Building");
  assert.equal(a.suburb, "MELBOURNE");
  assert.equal(a.postcode, "3000");
});

test("normaliseAddress handles suburb with parenthetical region", () => {
  const a = normaliseAddress([
    "T10 / 1 - 15 Banchory Avenue",
    "Hillside (Greater Melbourne)                     VIC                     3037",
  ]);
  assert.equal(a.street, "T10 / 1 - 15 Banchory Avenue");
  assert.equal(a.suburb, "Hillside (Greater Melbourne)");
  assert.equal(a.postcode, "3037");
});

test("normaliseAddress tolerates a trailing line that is just 'VIC <postcode>'", () => {
  const a = normaliseAddress(["332 Broadway Wycheproof", "vic 3527"]);
  assert.equal(a.state, "VIC");
  assert.equal(a.postcode, "3527");
  // No reliable suburb: the prior line folds suburb into the street.
  assert.equal(a.suburb, "");
  assert.equal(a.street, "332 Broadway Wycheproof");
});

test("normaliseAddress returns empty object for no lines", () => {
  const a = normaliseAddress([]);
  assert.deepEqual(a, {
    full: "",
    street: "",
    suburb: "",
    state: "VIC",
    postcode: "",
  });
});

test("recordKey is deterministic for the same address", () => {
  const rec = parseVpaRecord(SAMPLE_RECORD);
  const k1 = recordKey(rec);
  const k2 = recordKey({ ...rec, address_lines: rec.address_lines });
  assert.equal(k1, k2);
  assert.equal(k1.length, 40); // sha1 hex
});

test("recordToCsvRows produces one row per licensee", () => {
  const rec = parseVpaRecord(MULTI_LICENSEE_RECORD);
  const rows = recordToCsvRows(rec, {
    sourceTimestamp: "2026-07-29T22:00:00Z",
    sourceUrl: "https://pharmacy.vic.gov.au/register-search/",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].premises_name, rec.premises_name);
  assert.equal(rows[0].licensee_name, "Anthony Bassaly");
  assert.equal(rows[1].licensee_name, "Shirley Tsui");
  for (const row of rows) {
    assert.equal(row.source, VPA_SOURCE);
    assert.equal(row.scraped_at, "2026-07-29T22:00:00Z");
    assert.equal(row.source_url, "https://pharmacy.vic.gov.au/register-search/");
  }
});

test("recordToCsvRows emits a single row when a premises has no licensees", () => {
  const rec = parseVpaRecord(SAMPLE_RECORD);
  rec.licensees = [];
  const rows = recordToCsvRows(rec);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].licensee_name, "");
  assert.equal(rows[0].licensee_conditions, "");
});

test("rowsToCsv quotes fields containing commas and escapes embedded quotes", () => {
  const csv = rowsToCsv(
    [
      {
        a: "simple",
        b: "has, comma",
        c: 'has "quote" inside',
        d: "line\nbreak",
      },
    ],
    ["a", "b", "c", "d"],
  );
  // The row is two physical lines: the header, then a row that contains an
  // embedded newline inside a quoted field. Split only on the first newline
  // so we capture the whole row.
  const firstNewline = csv.indexOf("\n");
  const header = csv.slice(0, firstNewline);
  const row = csv.slice(firstNewline + 1);
  assert.equal(header, "a,b,c,d");
  assert.equal(row, 'simple,"has, comma","has ""quote"" inside","line\nbreak"\n');
});

test("VPA_CSV_COLUMNS preserves the documented column order", () => {
  assert.deepEqual(VPA_CSV_COLUMNS, [
    "source",
    "scraped_at",
    "source_url",
    "premises_name",
    "street_address",
    "suburb",
    "state",
    "postcode",
    "full_address",
    "registered_until",
    "registration_status",
    "premises_conditions",
    "licensee_name",
    "licensed_until",
    "licensee_status",
    "licensee_conditions",
  ]);
});
