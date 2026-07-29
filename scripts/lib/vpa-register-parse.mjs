// Pure functions for parsing the Victorian Pharmacy Authority (VPA) public
// register HTML and normalising addresses. The register is rendered server-side
// by `pharmacy.vic.gov.au` and returned as a self-contained HTML fragment with
// one `<div class="row record">` per registered premises. Every record embeds
// the premises name, address, registration status/dates, conditions, and a
// variable number of licensee(s) — each with their own status, dates, and
// conditions.
//
// The parser is intentionally tolerant: the address lines are full of
// irregular whitespace (the source template pads suburb/state/postcode with
// long runs of spaces) and many addresses run across multiple lines with the
// suburb and VIC postcode on a single trailing line.

import crypto from "node:crypto";

export const VPA_SOURCE = "vpa_public_register";

const ADDRESS_LINE_WHITESPACE = /\s+/g;
const VIC_POSTCODE_RE = /\b(\d{4})\s*$/;

/**
 * Split a record from the VPA register HTML into its structured parts. Returns
 * `null` if the fragment does not look like a record so the caller can skip
 * noise.
 */
export function parseVpaRecord(recordHtml) {
  const premisesName = extractFirst(recordHtml, "premisesname");
  if (!premisesName) return null;

  const premisesBlock = extractPremisesBlock(recordHtml);
  const addressLines = extractAddressLines(premisesBlock);
  const registeredUntil = extractFirst(premisesBlock, "registereduntil") ?? "";
  const registrationStatus = extractFirst(premisesBlock, "registrationstatus") ?? "";
  const premisesConditions = extractConditions(premisesBlock);

  // Licensee(s) section: each .licensee block carries a name and optional
  // status/dates/conditions. The .licensees wrapper may contain 0..N entries.
  const licenseeBlocks = splitLicenseeBlocks(recordHtml);
  const licensees = licenseeBlocks.map((block) => ({
    name: extractFirst(block, "licenseename") ?? "",
    licensed_until: normaliseDate(extractFirst(block, "licenseduntil") ?? ""),
    status: normaliseLicenceStatus(extractFirst(block, "licensestatus") ?? ""),
    conditions: extractConditions(block),
  }));

  return {
    premises_name: premisesName,
    address_lines: addressLines,
    registered_until: normaliseDate(registeredUntil),
    registration_status: normaliseStatus(registrationStatus),
    conditions: premisesConditions,
    licensees,
  };
}

/**
 * Normalise a VPA address block into structured street/suburb/state/postcode.
 * The block arrives as 1..N lines; the trailing line almost always carries
 * `<Suburb>     VIC     <Postcode>` separated by long runs of spaces. The
 * strategy is: collapse whitespace, then peel the postcode, then peel the
 * suburb, then everything left is the street address.
 */
export function normaliseAddress(lines) {
  const collapsed = (lines ?? [])
    .map((line) => (line ?? "").replace(ADDRESS_LINE_WHITESPACE, " ").trim())
    .filter(Boolean);

  const full = collapsed.join(", ");

  if (collapsed.length === 0) {
    return { full: "", street: "", suburb: "", state: "VIC", postcode: "" };
  }

  const lastLine = collapsed[collapsed.length - 1];
  const lastLineMatch = lastLine.match(/^(.*?)\s+(VIC)\s+(\d{4})\s*$/i);

  let state = "VIC";
  let postcode = "";
  let suburb = "";
  let streetLines = collapsed.slice(0, -1);
  let streetTail = "";

  if (lastLineMatch) {
    const tailText = lastLineMatch[1].trim();
    state = lastLineMatch[2].toUpperCase();
    postcode = lastLineMatch[3];

    const trailingParts = tailText.split(/\s*,\s*/).filter(Boolean);
    if (trailingParts.length > 1) {
      suburb = trailingParts[trailingParts.length - 1].trim();
      streetTail = trailingParts.slice(0, -1).join(", ");
    } else if (trailingParts.length === 1) {
      suburb = trailingParts[0].trim();
    }
  } else {
    // Some records omit the suburb line entirely and the postcode sits on the
    // last physical line by itself. Try to extract a 4-digit postcode from the
    // final token. If the only content is `VIC <postcode>` (e.g. lowercased
    // "vic 3527") treat the state as already accounted for and treat the
    // previous collapsed line as the suburb.
    const trailingPostcode = lastLine.match(VIC_POSTCODE_RE);
    if (trailingPostcode) {
      postcode = trailingPostcode[1];
      const before = lastLine.slice(0, trailingPostcode.index).trim();
      if (/^VIC$/i.test(before) || before === "") {
        // Trailing line is just `VIC <postcode>`. Suburb should be on the
        // previous line. Heuristic: if the previous line is short (no digits,
        // no comma, looks like a name) treat it as the suburb; otherwise
        // treat it as the street and leave the suburb blank — the records
        // office does not always supply a suburb in this configuration.
        if (streetLines.length > 0) {
          const prev = streetLines[streetLines.length - 1];
          if (looksLikeSuburbName(prev) && streetLines.length > 1) {
            suburb = prev;
            streetLines = streetLines.slice(0, -1);
          } else {
            // No reliable suburb: keep the previous line as part of the
            // street and leave suburb blank.
            suburb = "";
          }
        }
      } else {
        // Treat the residual text as the suburb.
        suburb = before;
      }
    }
  }

  const street = [streetLines.join(", "), streetTail].filter(Boolean).join(", ");

  return {
    full: full,
    street: cleanStreet(street),
    suburb: suburb,
    state: state,
    postcode: postcode,
  };
}

/**
 * Build a stable per-premises key from the name + canonical address. Used to
 * dedupe records returned under overlapping postcodes or repeated queries.
 */
export function recordKey(record) {
  const address = normaliseAddress(record.address_lines);
  const seed = [
    record.premises_name.trim().toLowerCase(),
    address.street.trim().toLowerCase(),
    address.suburb.trim().toLowerCase(),
    address.postcode,
  ].join("|");
  return crypto.createHash("sha1").update(seed).digest("hex");
}

/**
 * Convert a parsed VPA record into one or more CSV rows. Each licensee
 * produces a row, so a premises with three licensees becomes three rows with
 * the same premises fields but different licensee fields. Premises with no
 * listed licensee still get one row with empty licensee fields.
 */
export function recordToCsvRows(record, { sourceTimestamp, sourceUrl } = {}) {
  const address = normaliseAddress(record.address_lines);
  const premisesConditions = (record.conditions ?? [])
    .map((c) => c.text)
    .filter(Boolean)
    .join(" | ");

  const licensees =
    record.licensees && record.licensees.length > 0
      ? record.licensees
      : [
          {
            name: "",
            licensed_until: "",
            status: "",
            conditions: [],
          },
        ];

  return licensees.map((lic) => ({
    source: VPA_SOURCE,
    scraped_at: sourceTimestamp ?? "",
    source_url: sourceUrl ?? "",
    premises_name: record.premises_name,
    street_address: address.street,
    suburb: address.suburb,
    state: address.state,
    postcode: address.postcode,
    full_address: address.full,
    registered_until: record.registered_until,
    registration_status: record.registration_status,
    premises_conditions: premisesConditions,
    licensee_name: lic.name,
    licensed_until: lic.licensed_until,
    licensee_status: lic.status,
    licensee_conditions: (lic.conditions ?? [])
      .map((c) => c.text)
      .filter(Boolean)
      .join(" | "),
  }));
}

/**
 * Build the CSV string for a set of rows. Caller supplies the column order.
 */
export function rowsToCsv(rows, columns) {
  const header = columns.map(csvEscape).join(",");
  const body = rows
    .map((row) => columns.map((col) => csvEscape(row[col] ?? "")).join(","))
    .join("\n");
  return `${header}\n${body}${body.length ? "\n" : ""}`;
}

export const VPA_CSV_COLUMNS = [
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
];

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

function extractFirst(html, className) {
  const re = new RegExp(`<span class=['"]${className}['"]>([\\s\\S]*?)<\\/span>`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractPremisesBlock(recordHtml) {
  // The premises div contains nested <div> elements (for conditions) so a
  // non-greedy match on the first </div> cuts the block short. Walk forward
  // tracking div nesting depth from the opening tag until the depth returns
  // to zero, then slice the inner HTML.
  const open = recordHtml.match(/<div class="col-md-6 premises">/i);
  if (!open) return "";
  const start = open.index + open[0].length;
  const slice = recordHtml.slice(start);

  const tagRe = /<(\/?)div[\s>]/g;
  let depth = 1;
  let lastMatch = 0;
  let m;
  while ((m = tagRe.exec(slice)) !== null) {
    if (m[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        lastMatch = m.index;
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (depth !== 0) return "";
  return slice.slice(0, lastMatch);
}

function extractConditions(html) {
  if (!html) return [];
  // The premises-level conditions are rendered as <div> blocks, while
  // licensee-level conditions are wrapped in <span> elements. Match either
  // by accepting any tag that carries the `condition` class and a
  // `conditionid` attribute.
  const re =
    /<[a-z]+[^>]+class=['"][^'"]*\bcondition\b[^'"]*['"][^>]*conditionid=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/[a-z]+>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ id: m[1], text: decodeEntities(m[2].trim()) });
  }
  return out;
}

function extractAddressLines(premisesBlockHtml) {
  // The premises block is supplied by the caller. Split on <br/>, strip
  // tags, drop empty lines, then drop the premises name (already extracted
  // by parseVpaRecord) and the registered/status/condition lines that the
  // address parser doesn't need.
  if (!premisesBlockHtml) return [];
  const lines = premisesBlockHtml
    .split(/<br\s*\/?>/i)
    .map((line) => stripTags(line).trim())
    .filter(Boolean);
  return lines.slice(1).filter((line) => {
    if (/^Registered until/i.test(line)) return false;
    if (/^Registration status:/i.test(line)) return false;
    if (/^Licence status:/i.test(line)) return false;
    if (/^Licensed until/i.test(line)) return false;
    return true;
  });
}

function splitLicenseeBlocks(recordHtml) {
  const wrapperMatch = recordHtml.match(
    /<div class="row licensees">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i,
  );
  if (!wrapperMatch) return [];
  const wrapper = wrapperMatch[1];
  const blocks = wrapper.split(/<div class="col-md-12 licensee[^"]*">/i);
  return blocks.slice(1).map((block) => {
    const close = block.search(/<\/div>/i);
    return close >= 0 ? block.slice(0, close) : block;
  });
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const STREET_KEYWORD_RE =
  /\b(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Place|Drive|Dr\.?|Boulevard|Bvd\.?|Highway|Hwy\.?|Parade|Terrace|Tce\.?|Court|Ct\.?|Way|Level|Floor|Shop|Unit|Tenancy|Suite|Building|Centre|Center|Plaza|Mall|Arcade|Esplanade|Square|Concours|Concourse|Retail|Ground|Lower|Upper|Basement|Podium)\b/i;
const DIGIT_RE = /\d/;

/**
 * Heuristic for the trailing `VIC <postcode>` case: a single previous line is
 * a suburb name if it has no digits, no commas, no street-type keywords, and
 * is a short label (1-3 words). Anything else (e.g. "332 Broadway Wycheproof")
 * is treated as part of the street and the suburb is left blank.
 */
function looksLikeSuburbName(value) {
  if (!value) return false;
  if (DIGIT_RE.test(value)) return false;
  if (value.includes(",")) return false;
  if (STREET_KEYWORD_RE.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4;
}

function normaliseDate(value) {
  if (!value) return "";
  return value.replace(/^(?:Registered|Licensed) until\s*/i, "").trim();
}

function normaliseStatus(value) {
  if (!value) return "";
  return value.replace(/^Registration status:\s*/i, "").trim();
}

function normaliseLicenceStatus(value) {
  if (!value) return "";
  return value.replace(/^Licence status:\s*/i, "").trim();
}

function cleanStreet(value) {
  return value.replace(ADDRESS_LINE_WHITESPACE, " ").replace(/,\s*$/, "").trim();
}
