import { createHash } from "node:crypto";

const STREET_TYPES = new Map([
  ["street", "st"],
  ["road", "rd"],
  ["avenue", "ave"],
  ["drive", "dr"],
  ["highway", "hwy"],
  ["parade", "pde"],
  ["boulevard", "blvd"],
  ["lane", "ln"],
  ["place", "pl"],
  ["court", "ct"],
  ["crescent", "cres"],
]);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...data] = rows;
  if (!headers?.length) throw new Error("CSV has no header row.");
  return data
    .filter((values) => values.some(Boolean))
    .map((values, rowIndex) => {
      if (values.length !== headers.length) {
        throw new Error(
          `CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`,
        );
      }
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    });
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normaliseText(value = "") {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normaliseStreet(value = "") {
  const withoutUnit = normaliseText(value).replace(
    /\b(?:shop|unit|suite|level|floor)\s*[a-z0-9-]*\b/g,
    " ",
  );
  const tokens = withoutUnit.split(" ").filter(Boolean);
  return tokens
    .map((token) => STREET_TYPES.get(token) ?? token)
    .filter((token) => !["ground", "floor", "retail", "shop", "suite", "unit"].includes(token))
    .join(" ");
}

export function sourcePremisesKey(row) {
  return [
    normaliseText(row.premises_name),
    normaliseStreet(row.street_address),
    normaliseText(row.suburb),
    row.postcode.trim(),
  ].join("|");
}

export function structuredAddressKey(row) {
  return [
    normaliseStreet(row.street_address ?? row.address),
    normaliseText(row.suburb),
    String(row.postcode ?? "").trim(),
  ].join("|");
}

function validDate(value) {
  if (!value) return true;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.getUTCDate() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2])
  );
}

export function groupVpaRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = sourcePremisesKey(row);
    const current = grouped.get(key) ?? {
      source_key: key,
      premises_name: row.premises_name,
      street_address: row.street_address,
      suburb: row.suburb,
      state: row.state,
      postcode: row.postcode,
      full_address: row.full_address,
      registered_until: row.registered_until,
      registration_status: row.registration_status,
      premises_conditions: row.premises_conditions,
      source: row.source,
      source_url: row.source_url,
      scraped_at: row.scraped_at,
      licensees: [],
      source_rows: [],
    };
    current.source_rows.push(row);
    if (row.licensee_name) {
      current.licensees.push({
        name: row.licensee_name,
        licensed_until: row.licensed_until,
        status: row.licensee_status,
        conditions: row.licensee_conditions,
      });
    }
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function countBy(values) {
  return Object.fromEntries(
    [
      ...values.reduce(
        (map, value) => map.set(value || "(blank)", (map.get(value || "(blank)") ?? 0) + 1),
        new Map(),
      ),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function auditVpaRows(rows) {
  const premises = groupVpaRows(rows);
  const exactRows = rows.map((row) => JSON.stringify(row));
  const uniqueRows = new Set(exactRows);
  const licenseeNames = new Set(rows.map((row) => row.licensee_name.trim()).filter(Boolean));
  const addressKeys = new Set(premises.map(structuredAddressKey));
  const premisesConflicts = premises.filter((item) => {
    const signatures = new Set(
      item.source_rows.map((row) =>
        [row.registration_status, row.registered_until, row.premises_conditions].join("|"),
      ),
    );
    return signatures.size > 1;
  });
  const blanks = {};
  for (const column of Object.keys(rows[0] ?? {})) {
    blanks[column] = rows.filter((row) => !row[column]?.trim()).length;
  }
  const linkedCounts = new Map();
  for (const premisesRow of premises) {
    for (const name of new Set(premisesRow.licensees.map((licensee) => licensee.name))) {
      linkedCounts.set(name, (linkedCounts.get(name) ?? 0) + 1);
    }
  }
  return {
    csv_rows: rows.length,
    distinct_premises: premises.length,
    distinct_addresses: addressKeys.size,
    named_licensee_rows: rows.filter((row) => row.licensee_name.trim()).length,
    distinct_named_licensees: licenseeNames.size,
    premises_without_named_licensee: premises.filter((item) => item.licensees.length === 0).length,
    registration_status_distribution: countBy(premises.map((item) => item.registration_status)),
    licence_status_distribution: countBy(rows.map((row) => row.licensee_status)),
    active_premises: premises.filter((item) => normaliseText(item.registration_status) === "active")
      .length,
    explicitly_closed_premises: premises.filter(
      (item) => normaliseText(item.registration_status) === "closed",
    ).length,
    unknown_statuses: premises.filter(
      (item) =>
        !["active", "closed", "inactive", "suspended", "cancelled", "canceled"].includes(
          normaliseText(item.registration_status),
        ),
    ).length,
    duplicate_source_rows: rows.length - uniqueRows.size,
    malformed_dates: rows.filter(
      (row) => !validDate(row.registered_until) || !validDate(row.licensed_until),
    ).length,
    invalid_postcodes: premises.filter((item) => !/^3\d{3}$/.test(item.postcode)).length,
    missing_address_components: premises.filter(
      (item) => !item.street_address || !item.suburb || !item.postcode,
    ).length,
    premises_with_multiple_licensees: premises.filter((item) => item.licensees.length > 1).length,
    licensees_linked_to_multiple_premises: [...linkedCounts.values()].filter((count) => count > 1)
      .length,
    conflicting_premises_rows: premisesConflicts.length,
    premises_rows_with_conditions: premises.filter((item) => item.premises_conditions).length,
    licensee_rows_with_conditions: rows.filter((row) => row.licensee_conditions).length,
    blank_fields_by_column: blanks,
  };
}

function tokenSimilarity(left, right) {
  const a = new Set(normaliseText(left).split(" ").filter(Boolean));
  const b = new Set(normaliseText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

export function classifyPremisesMatch(source, canonicalRows) {
  const addressKey = structuredAddressKey(source);
  const exactAddress = canonicalRows.filter((row) => structuredAddressKey(row) === addressKey);
  const exactName = (row) => normaliseText(row.name) === normaliseText(source.premises_name);
  if (exactAddress.length === 1 && exactName(exactAddress[0])) {
    return disposition("exact_match", exactAddress[0], 1, [
      "exact_structured_address",
      "exact_name",
    ]);
  }
  if (exactAddress.length === 1) {
    return disposition("renamed_premises_candidate", exactAddress[0], 0.92, [
      "exact_structured_address",
      "trading_name_differs",
    ]);
  }
  if (exactAddress.length > 1) {
    return disposition(
      "ambiguous_match",
      null,
      0,
      ["multiple_exact_address_candidates"],
      exactAddress,
    );
  }

  const postcodeRows = canonicalRows.filter(
    (row) => String(row.postcode ?? "") === source.postcode,
  );
  const scored = postcodeRows
    .map((row) => {
      const address = tokenSimilarity(row.address, source.street_address);
      const name = tokenSimilarity(row.name, source.premises_name);
      const suburb = normaliseText(row.suburb) === normaliseText(source.suburb) ? 1 : 0;
      return { row, score: address * 0.55 + name * 0.3 + suburb * 0.15, address, name, suburb };
    })
    .filter((candidate) => candidate.address >= 0.7)
    .sort((left, right) => right.score - left.score);
  if (scored[0]?.score >= 0.84 && (!scored[1] || scored[0].score - scored[1].score >= 0.12)) {
    return disposition("high_confidence_match", scored[0].row, scored[0].score, [
      "strong_address_similarity",
      "postcode_agreement",
      scored[0].suburb ? "suburb_agreement" : "suburb_differs",
      scored[0].name >= 0.6 ? "name_similarity" : "name_differs",
    ]);
  }
  const sameNameElsewhere = canonicalRows.filter(exactName);
  if (sameNameElsewhere.length) {
    return disposition(
      "relocation_candidate",
      null,
      0,
      ["same_name_different_address"],
      sameNameElsewhere,
    );
  }
  if (scored.length) {
    return disposition(
      "ambiguous_match",
      null,
      scored[0].score,
      ["weak_or_competing_candidates"],
      scored.map((item) => item.row),
    );
  }
  return disposition("unmatched_new_premises", null, 0, ["no_safe_canonical_candidate"]);
}

function disposition(kind, match, score, factors, candidates = match ? [match] : []) {
  return {
    disposition: kind,
    canonical_premises_id: match?.id ?? null,
    score: Number(score.toFixed(4)),
    factors,
    conflicts: factors.filter(
      (factor) => factor.includes("differs") || factor.includes("multiple"),
    ),
    candidate_ids: candidates.map((candidate) => candidate.id),
    algorithm_version: "vpa-match-v1.0.0",
    review_status: ["exact_match", "high_confidence_match"].includes(kind)
      ? "auto_accepted"
      : "review_required",
  };
}
