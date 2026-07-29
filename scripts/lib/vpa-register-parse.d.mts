export interface ParsedVpaRecord {
  premises_name: string;
  address_lines: string[];
  registered_until: string;
  registration_status: string;
  conditions: Array<{ id?: string; text?: string }>;
  licensees: Array<{
    name: string;
    licensed_until: string;
    status: string;
    conditions: Array<{ id?: string; text?: string }>;
  }>;
}

export function parseVpaRecord(html: string): ParsedVpaRecord | null;
export function normaliseAddress(lines: string[]): {
  full: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
};
export function recordKey(record: { premises_name: string; address_lines: string[] }): string;
export function recordToCsvRows(
  record: unknown,
  options?: { sourceTimestamp?: string; sourceUrl?: string },
): Array<Record<string, unknown>>;
export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string;
export const VPA_CSV_COLUMNS: string[];
