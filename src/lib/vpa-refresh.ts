import {
  normaliseAddress,
  recordKey,
  recordToCsvRows,
  rowsToCsv,
  VPA_CSV_COLUMNS,
} from "../../scripts/lib/vpa-register-parse.mjs";

export type VpaCondition = { id?: string; text?: string };
export type VpaLicensee = {
  name: string;
  licensed_until?: string;
  status?: string;
  conditions?: VpaCondition[];
};
export type VpaRecord = {
  premises_name: string;
  address_lines: string[];
  registered_until?: string;
  registration_status?: string;
  conditions?: VpaCondition[];
  licensees?: VpaLicensee[];
};

export type ExistingPremises = {
  id: string;
  name: string;
  address: string;
  suburb: string | null;
  postcode: string | null;
  vpa_record_key: string | null;
};

export type PreparedVpaRefresh = {
  premises: Array<Record<string, unknown>>;
  licensees: Array<Record<string, unknown>>;
  currentKeys: string[];
  premisesAdded: number;
  premisesUpdated: number;
};

export type VpaRegistrationStatus =
  "active" | "closed" | "inactive" | "suspended" | "cancelled" | "unknown" | "review_required";

export type VpaCoverageInput = {
  records: VpaRecord[];
  postcodesQueried: number;
  capWarnings: number;
  errors: string[];
  baselineCount?: number | null;
};

export function normaliseVpaRegistrationStatus(raw?: string): VpaRegistrationStatus {
  const status = raw?.trim().toLowerCase();
  if (!status) return "unknown";
  if (status === "active") return "active";
  if (status === "closed") return "closed";
  if (status === "inactive") return "inactive";
  if (status === "suspended") return "suspended";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  return "review_required";
}

export function validateVpaRefreshCoverage(input: VpaCoverageInput): string[] {
  const reasons: string[] = [];
  if (input.postcodesQueried !== 1000) {
    reasons.push(`Expected 1000 postcode requests; completed ${input.postcodesQueried}.`);
  }
  if (input.capWarnings > 0) {
    reasons.push(`${input.capWarnings} postcode responses reached the source result cap.`);
  }
  if (input.errors.length > 0) {
    reasons.push(`${input.errors.length} postcode or parsing errors were reported.`);
  }
  const minimumCount = Math.max(
    1400,
    input.baselineCount ? Math.floor(input.baselineCount * 0.9) : 0,
  );
  if (input.records.length < minimumCount) {
    reasons.push(
      `Premises count ${input.records.length} is below the safe minimum ${minimumCount}.`,
    );
  }
  const keys = input.records.map(recordKey);
  const duplicateCount = keys.length - new Set(keys).size;
  if (duplicateCount > 0) {
    reasons.push(`${duplicateCount} duplicate VPA source keys were detected.`);
  }
  return reasons;
}

export function canonicalPremisesKey(input: {
  name: string;
  street: string;
  suburb: string;
  postcode: string;
}): string {
  return recordKey({
    premises_name: input.name,
    address_lines: [input.street, `${input.suburb} VIC ${input.postcode}`.trim()].filter(Boolean),
  });
}

export function prepareVpaRefresh(
  records: VpaRecord[],
  existing: ExistingPremises[],
  sourceId: string,
  syncedAt: string,
): PreparedVpaRefresh {
  const existingByKey = new Map<string, ExistingPremises>();
  for (const row of existing) {
    const key =
      row.vpa_record_key ??
      canonicalPremisesKey({
        name: row.name,
        street: row.address,
        suburb: row.suburb ?? "",
        postcode: row.postcode ?? "",
      });
    existingByKey.set(key, row);
  }

  const premises: Array<Record<string, unknown>> = [];
  const licensees: Array<Record<string, unknown>> = [];
  const currentKeys: string[] = [];
  let premisesAdded = 0;
  let premisesUpdated = 0;

  for (const record of records) {
    const address = normaliseAddress(record.address_lines);
    const key = recordKey(record);
    const prior = existingByKey.get(key);
    const premisesId = prior?.id ?? crypto.randomUUID();
    const publishedLicenseeNames = (record.licensees ?? [])
      .map((licensee) => licensee.name.trim())
      .filter(Boolean);
    const rawStatus = record.registration_status?.trim() || null;
    const normalisedStatus = normaliseVpaRegistrationStatus(record.registration_status);
    const conditions = joinConditions(record.conditions);

    currentKeys.push(key);
    if (prior) premisesUpdated += 1;
    else premisesAdded += 1;

    premises.push({
      id: premisesId,
      name: record.premises_name,
      address: address.street || address.full,
      suburb: address.suburb || null,
      postcode: address.postcode || null,
      vpa_record_key: key,
      published_licensee_names: publishedLicenseeNames.length ? publishedLicenseeNames : null,
      vpa_match_status: prior ? "exact_match" : "unmatched_new_premises",
      vpa_source_verification_status: "authoritative_source",
      vpa_registration_status_raw: rawStatus,
      vpa_registration_status_normalised: normalisedStatus,
      vpa_registered_until: toIsoDate(record.registered_until),
      vpa_premises_conditions_raw: conditions,
      vpa_first_observed_at: syncedAt,
      vpa_last_observed_at: syncedAt,
      vpa_snapshot_reference_date: syncedAt.slice(0, 10),
      vpa_currently_observed: true,
      vpa_registration_checked_at: syncedAt,
      vpa_source_id: sourceId,
      premises_source: "vpa_register",
      source_confidence: "authoritative",
      source_id: sourceId,
      vpa_last_synced_at: syncedAt,
      updated_at: syncedAt,
    });

    for (const licensee of record.licensees ?? []) {
      const name = licensee.name.trim();
      if (!name) continue;
      licensees.push({
        premises_id: premisesId,
        licensee_name: name,
        licensed_until: toIsoDate(licensee.licensed_until),
        license_status: licensee.status || null,
        conditions: joinConditions(licensee.conditions),
        source_id: sourceId,
        vpa_source_id: sourceId,
        vpa_record_key: key,
        vpa_premises_name: record.premises_name,
        vpa_street: address.street || null,
        vpa_suburb: address.suburb || null,
        vpa_postcode: address.postcode || null,
        last_seen_at: syncedAt,
        first_observed_at: syncedAt,
        currently_observed: true,
        review_status: "unreviewed",
      });
    }
  }

  return { premises, licensees, currentKeys, premisesAdded, premisesUpdated };
}

export function staleVpaPremises(
  existing: ExistingPremises[],
  currentKeys: Iterable<string>,
): ExistingPremises[] {
  const current = new Set(currentKeys);
  return existing.filter((row) => row.vpa_record_key && !current.has(row.vpa_record_key));
}

export function toIsoDate(value?: string): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function recordsToVpaCsv(records: VpaRecord[], sourceTimestamp: string): string {
  return rowsToCsv(
    records.flatMap((record) =>
      recordToCsvRows(record, {
        sourceTimestamp,
        sourceUrl: "https://pharmacy.vic.gov.au/register-search/",
      }),
    ),
    VPA_CSV_COLUMNS,
  );
}

function joinConditions(conditions?: VpaCondition[]): string | null {
  const text = (conditions ?? [])
    .map((condition) => condition.text?.trim())
    .filter(Boolean)
    .join(" | ");
  return text || null;
}
