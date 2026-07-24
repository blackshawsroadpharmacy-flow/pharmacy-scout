#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://dhhs.cartodb.com/api/v2/sql?q=SELECT%20cra90_pharmacyname%20as%20pharmacyname,cra90_address1%20as%20address,cra90_suburbtown%20as%20suburb,cra90_postcode%20as%20postcode,cra90_pharmacyphone%20as%20phone,cr32c_pharmacywebpage%20as%20website%20FROM%20public.community_pharmacies&format=CSV&filename=community_pharmacies_victoria.csv";

async function main() {
  const outputPath =
    process.argv[2] ??
    path.join(process.cwd(), "data", "source", "community_pharmacies_victoria.csv");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "PharmacyScoutSourceDownloader/0.1 (local-repo-script)",
      accept: "text/csv",
    },
  });

  if (!response.ok) {
    throw new Error(`Source download failed with HTTP ${response.status}`);
  }

  const csv = await response.text();
  await fs.writeFile(outputPath, csv, "utf8");

  const rowCount = csv.trim().split(/\r?\n/).length - 1;
  process.stdout.write(`${outputPath}\nrows=${rowCount}\nsource=${SOURCE_URL}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
