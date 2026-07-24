import crypto from "node:crypto";

export const PHARMACY_SOURCE = "community_pharmacies_victoria_csv";

export function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = splitCsvLine(lines.shift() ?? "");
  return lines.map((line) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      pharmacyname: row.pharmacyname?.trim() ?? "",
      address: row.address?.trim() ?? "",
      suburb: row.suburb?.trim() ?? "",
      postcode: row.postcode?.trim() ?? "",
      phone: row.phone?.trim() ?? "",
      website: row.website?.trim() ?? "",
    };
  });
}

export function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

export function normalizeRow(row, rowNumber) {
  const warnings = [];
  const postcode = normalizePostcode(row.postcode, warnings);
  const phoneInfo = normalizePhone(row.phone);
  const websiteInfo = normalizeWebsite(row.website);

  if (phoneInfo.warning) warnings.push(phoneInfo.warning);
  if (websiteInfo.warning) warnings.push(websiteInfo.warning);

  const displayAddress = [row.address, row.suburb, postcode].filter(Boolean).join(", ");

  return {
    row_number: rowNumber,
    pharmacyname: row.pharmacyname,
    canonical_name: collapseWhitespace(row.pharmacyname),
    address: row.address,
    suburb: row.suburb,
    postcode,
    display_address: displayAddress,
    normalized_name: normalizeMatchText(row.pharmacyname),
    normalized_address: normalizeAddress(row.address),
    normalized_suburb: normalizeMatchText(row.suburb),
    normalized_phone: phoneInfo.normalized,
    phone: phoneInfo.normalized ?? (row.phone || null),
    phone_raw: row.phone || null,
    website: websiteInfo.normalized,
    website_raw: row.website || null,
    matching_key: [
      normalizeMatchText(row.pharmacyname),
      normalizeAddress(row.address),
      postcode || "0000",
    ].join("|"),
    data_quality_warnings: warnings,
  };
}

export function normalizePostcode(value, warnings) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 4) return digits;
  warnings.push(`Unexpected postcode format: ${value}`);
  return digits.padStart(4, "0").slice(-4);
}

export function normalizePhone(value) {
  const trimmed = value.trim();
  if (!trimmed) return { normalized: null, warning: null };

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return { normalized: null, warning: `Phone field is non-numeric: ${value}` };
  }

  if (digits.length === 9 && (digits.startsWith("3") || digits.startsWith("4"))) {
    return {
      normalized: `0${digits}`,
      warning: `Prepended leading zero to Australian phone number: ${value}`,
    };
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    return { normalized: digits, warning: null };
  }

  return {
    normalized: digits,
    warning: `Ambiguous phone format retained without reinterpretation: ${value}`,
  };
}

export function normalizeWebsite(value) {
  const trimmed = value.trim();
  if (!trimmed) return { normalized: null, warning: null };

  if (/^https?:\/\//i.test(trimmed)) {
    return { normalized: trimmed, warning: null };
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return {
      normalized: `https://${trimmed}`,
      warning: `Prepended https:// to website: ${value}`,
    };
  }

  return {
    normalized: trimmed,
    warning: `Website retained in original form for manual review: ${value}`,
  };
}

export function normalizeAddress(value) {
  return normalizeMatchText(value)
    .replace(/\bUNIT\b/g, "U")
    .replace(/\bSUITE\b/g, "STE")
    .replace(/\bSHOP\b/g, "SHP")
    .replace(/\bLEVEL\b/g, "LVL")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bPARADE\b/g, "PDE")
    .replace(/\bCRESCENT\b/g, "CRES")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bMOUNT\b/g, "MT")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMatchText(value) {
  return collapseWhitespace(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function deterministicUuid(input) {
  const hex = crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export function buildCoverageReport(rows) {
  const coverage = {
    generated_at: new Date().toISOString(),
    source: PHARMACY_SOURCE,
    total_rows: rows.length,
    geocode_counts: {
      exact_high: 0,
      exact_medium: 0,
      approximate: 0,
      failed: 0,
    },
    method_counts: {},
    phone_repairs: 0,
    website_repairs: 0,
    warning_rows: 0,
  };

  for (const row of rows) {
    if (row.source_confidence === "high") coverage.geocode_counts.exact_high += 1;
    else if (row.source_confidence === "medium") coverage.geocode_counts.exact_medium += 1;
    else if (row.source_confidence === "approximate") coverage.geocode_counts.approximate += 1;
    else coverage.geocode_counts.failed += 1;

    coverage.method_counts[row.geocode_method] =
      (coverage.method_counts[row.geocode_method] ?? 0) + 1;

    if (row.data_quality_warnings.some((warning) => warning.includes("phone number"))) {
      coverage.phone_repairs += 1;
    }
    if (row.data_quality_warnings.some((warning) => warning.includes("https://"))) {
      coverage.website_repairs += 1;
    }
    if (row.data_quality_warnings.length > 0) coverage.warning_rows += 1;
  }

  return coverage;
}
