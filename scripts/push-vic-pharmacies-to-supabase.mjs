#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { deterministicUuid, PHARMACY_SOURCE } from "./lib/vic-pharmacy-import.mjs";

const CSV_SOURCE_NAME = "Community Pharmacies Victoria CSV (Chemist Care Now export)";
const CSV_SOURCE_URL =
  "https://dhhs.cartodb.com/api/v2/sql?q=SELECT%20cartodb_id%2Cthe_geom%2Cthe_geom_webmercator%2Cpharmacyname%2Caddress%2Csuburb%2Cpostcode%2Cphone%2Cwebsite%20FROM%20public.community_pharmacies&format=CSV&filename=community_pharmacies_victoria.csv";
const HEALTHDIRECT_PLACEHOLDER_NAME = "Pharmacy discovery point";

async function main() {
  const enrichedPath = process.argv[2];
  if (!enrichedPath) {
    throw new Error(
      "Usage: node scripts/push-vic-pharmacies-to-supabase.mjs <vic-pharmacies-enriched.json>",
    );
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error("SUPABASE_DB_URL is required");
  }

  const rows = JSON.parse(await fs.readFile(path.resolve(enrichedPath), "utf8"));
  const checksum = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");

  const preparedRows = rows.map((row) => {
    const premisesId = deterministicUuid(`premises:${row.matching_key}`);
    return {
      premises_id: premisesId,
      source_name: CSV_SOURCE_NAME,
      source_row_number: row.row_number,
      matching_key: row.matching_key,
      disposition: "imported_as_new_canonical_pharmacy",
      raw_payload: {
        pharmacyname: row.pharmacyname,
        address: row.address,
        suburb: row.suburb,
        postcode: row.postcode,
        phone: row.phone_raw,
        website: row.website_raw,
      },
      normalized_payload: row,
      geocode_provider: row.geocode_provider,
      geocode_method: row.geocode_method,
      geocode_confidence: row.source_confidence,
      warnings: row.data_quality_warnings ?? [],
      name: row.canonical_name,
      address: row.address,
      suburb: row.suburb,
      postcode: row.postcode,
      locality_name: row.suburb,
      lat: row.latitude,
      lng: row.longitude,
      public_door_lat: row.latitude,
      public_door_lng: row.longitude,
      source_confidence: row.source_confidence,
      phone: row.phone,
      website: row.website,
      geocode_method_for_premises: row.geocode_method,
    };
  });

  const sourceId = deterministicUuid(`source:${PHARMACY_SOURCE}`);
  const escapedJson = sqlLiteral(JSON.stringify(preparedRows));
  const escapedChecksum = sqlLiteral(checksum);
  const escapedSourceName = sqlLiteral(CSV_SOURCE_NAME);
  const escapedSourceUrl = sqlLiteral(CSV_SOURCE_URL);
  const escapedSourceSlug = sqlLiteral(PHARMACY_SOURCE);
  const sql = `
begin;

insert into public.source_records (
  id,
  source_name,
  source_kind,
  source_url,
  regulatory_purpose,
  licence_or_terms_status,
  fetched_at,
  coverage_description,
  row_count,
  checksum,
  confidence,
  notes
) values (
  '${sourceId}',
  '${escapedSourceName}',
  'healthdirect',
  '${escapedSourceUrl}',
  'Victorian community-pharmacy discovery import for Pharmacy Scout',
  'Source downloaded from public Better Health / Carto CSV endpoint; redistribution under review',
  now(),
  'Victoria statewide CSV import',
  ${preparedRows.length},
  '${escapedChecksum}',
  'high',
  'Imported via reproducible script from ${escapedSourceSlug}'
)
on conflict (id) do update
set
  source_name = excluded.source_name,
  source_kind = excluded.source_kind,
  source_url = excluded.source_url,
  regulatory_purpose = excluded.regulatory_purpose,
  licence_or_terms_status = excluded.licence_or_terms_status,
  fetched_at = excluded.fetched_at,
  coverage_description = excluded.coverage_description,
  row_count = excluded.row_count,
  checksum = excluded.checksum,
  confidence = excluded.confidence,
  notes = excluded.notes,
  updated_at = now();

delete from public.pharmacy_premises
where name = '${sqlLiteral(HEALTHDIRECT_PLACEHOLDER_NAME)}'
  and premises_source = 'healthdirect'
  and source_confidence = 'low';

with import_rows as (
  select *
  from jsonb_to_recordset('${escapedJson}'::jsonb) as x(
    premises_id uuid,
    source_name text,
    source_row_number int,
    matching_key text,
    disposition text,
    raw_payload jsonb,
    normalized_payload jsonb,
    geocode_provider text,
    geocode_method text,
    geocode_confidence text,
    warnings jsonb,
    name text,
    address text,
    suburb text,
    postcode text,
    locality_name text,
    lat double precision,
    lng double precision,
    public_door_lat double precision,
    public_door_lng double precision,
    source_confidence text,
    phone text,
    website text,
    geocode_method_for_premises text
  )
)
insert into public.pharmacy_premises (
  id,
  name,
  address,
  suburb,
  postcode,
  locality_name,
  location,
  public_door_location,
  door_source,
  door_confidence,
  vpa_registration_status,
  premises_source,
  source_confidence,
  source_id,
  phone,
  website,
  geocode_method
)
select
  premises_id,
  name,
  address,
  suburb,
  postcode,
  locality_name,
  case
    when lat is not null and lng is not null
      then st_setsrid(st_makepoint(lng, lat), 4326)::geography
    else null
  end,
  case
    when public_door_lat is not null and public_door_lng is not null
      then st_setsrid(st_makepoint(public_door_lng, public_door_lat), 4326)::geography
    else null
  end,
  'geocoded'::public.door_source,
  source_confidence,
  'unverified'::public.verification_status,
  'healthdirect'::public.premises_source_type,
  source_confidence,
  '${sourceId}'::uuid,
  phone,
  website,
  geocode_method_for_premises
from import_rows
on conflict (id) do update
set
  name = excluded.name,
  address = excluded.address,
  suburb = excluded.suburb,
  postcode = excluded.postcode,
  locality_name = excluded.locality_name,
  location = excluded.location,
  public_door_location = excluded.public_door_location,
  door_source = excluded.door_source,
  door_confidence = excluded.door_confidence,
  vpa_registration_status = excluded.vpa_registration_status,
  premises_source = excluded.premises_source,
  source_confidence = excluded.source_confidence,
  source_id = excluded.source_id,
  phone = excluded.phone,
  website = excluded.website,
  geocode_method = excluded.geocode_method,
  updated_at = now();

with import_rows as (
  select *
  from jsonb_to_recordset('${escapedJson}'::jsonb) as x(
    premises_id uuid,
    source_name text,
    source_row_number int,
    matching_key text,
    disposition text,
    raw_payload jsonb,
    normalized_payload jsonb,
    geocode_provider text,
    geocode_method text,
    geocode_confidence text,
    warnings jsonb,
    name text,
    address text,
    suburb text,
    postcode text,
    locality_name text,
    lat double precision,
    lng double precision,
    public_door_lat double precision,
    public_door_lng double precision,
    source_confidence text,
    phone text,
    website text,
    geocode_method_for_premises text
  )
)
insert into public.pharmacy_import_rows (
  id,
  source_name,
  source_row_number,
  matching_key,
  premises_id,
  disposition,
  raw_payload,
  normalized_payload,
  geocode_provider,
  geocode_method,
  geocode_confidence,
  warnings
)
select
  md5(source_name || ':' || source_row_number::text)::uuid,
  source_name,
  source_row_number,
  matching_key,
  premises_id,
  disposition,
  raw_payload,
  normalized_payload,
  geocode_provider,
  geocode_method,
  geocode_confidence,
  warnings
from import_rows
on conflict (source_name, source_row_number) do update
set
  matching_key = excluded.matching_key,
  premises_id = excluded.premises_id,
  disposition = excluded.disposition,
  raw_payload = excluded.raw_payload,
  normalized_payload = excluded.normalized_payload,
  geocode_provider = excluded.geocode_provider,
  geocode_method = excluded.geocode_method,
  geocode_confidence = excluded.geocode_confidence,
  warnings = excluded.warnings,
  updated_at = now();

commit;
`;

  const tempFile = path.join(os.tmpdir(), `push-vic-pharmacies-${Date.now()}.sql`);
  await fs.writeFile(tempFile, sql);
  const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/postgresql@18/bin/psql";
  await run(psql, [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", tempFile]);
  await fs.unlink(tempFile);
}

function sqlLiteral(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "''");
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
