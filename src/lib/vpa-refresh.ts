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
    const proprietorNames = (record.licensees ?? [])
      .map((licensee) => licensee.name.trim())
      .filter(Boolean);

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
      proprietor_names: proprietorNames.length ? proprietorNames : null,
      vpa_registration_status: "verified",
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
