import { parseVpaRecord, recordKey } from "../../scripts/lib/vpa-register-parse.mjs";
import type { VpaRecord } from "./vpa-refresh";

const ENDPOINT =
  "https://pharmacy.vic.gov.au/wp-admin/admin-ajax.php?action=newcrm_handler_register_search";
const REGISTER_URL = "https://pharmacy.vic.gov.au/register-search/";
const RECORD_CAP = 50;

export type VpaFetchProgress = {
  phase: "fetching";
  postcode: string;
  current: number;
  total: number;
};

export async function fetchLiveVpaRegister(
  onProgress: (progress: VpaFetchProgress) => void,
): Promise<{
  records: VpaRecord[];
  postcodesQueried: number;
  capWarnings: number;
  errors: string[];
}> {
  const records = new Map<string, VpaRecord>();
  const errors: string[] = [];
  let capWarnings = 0;
  let postcodesQueried = 0;

  for (let postcode = 3000; postcode <= 3999; postcode += 1) {
    const value = String(postcode);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "text/html, */*; q=0.1",
          "x-requested-with": "XMLHttpRequest",
          origin: "https://pharmacy.vic.gov.au",
          referer: REGISTER_URL,
        },
        body: new URLSearchParams({
          action: "newcrm_handler_register_search",
          searchterm: value,
          searchtype: "premises",
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const total = Number(html.match(/(\d+)\s+results found/)?.[1] ?? 0);
      if (total > RECORD_CAP) capWarnings += 1;

      const starts = [...html.matchAll(/<div class="row record">/g)];
      for (let index = 0; index < starts.length; index += 1) {
        const start = starts[index].index;
        const end = starts[index + 1]?.index ?? html.length;
        const record = parseVpaRecord(html.slice(start, end)) as VpaRecord | null;
        if (record) records.set(recordKey(record), record);
      }
    } catch (error) {
      errors.push(`${value}: ${error instanceof Error ? error.message : String(error)}`);
    }
    postcodesQueried += 1;
    onProgress({ phase: "fetching", postcode: value, current: postcodesQueried, total: 1000 });
  }

  return { records: [...records.values()], postcodesQueried, capWarnings, errors };
}
