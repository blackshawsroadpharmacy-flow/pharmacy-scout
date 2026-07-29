# Update Pharmacy

Authenticated administrators can refresh the Victorian Pharmacy Authority (VPA) public register
from the **Update Pharmacy** control in the application shell.

## Data flow

`POST /api/vpa/refresh` verifies the caller's Supabase bearer token and confirms an `admin` row in
`user_roles`. The first successful run consumes the bundled 29 July 2026 register snapshot. Later
runs query the VPA register server-side by Victorian postcode and stream progress to the browser as
server-sent events in the POST response. The browser never calls the VPA endpoint directly.

The refresh preserves local fields such as phone, website, coordinates, profiles and notes. It
matches premises with a SHA-1 natural key derived from canonicalised name, street, suburb and
postcode. Premises absent from a later register are marked `unverified`; they are never hard
deleted.

## Schema

- `pharmacy_premises.vpa_record_key` is the stable VPA natural key.
- `pharmacy_premises.proprietor_names` is the current denormalised proprietor list.
- `pharmacy_premises.vpa_last_synced_at` records register reconciliation time.
- `pharmacy_premises_licensees` retains current licensee details and VPA provenance.
- `pharmacy_vpa_runs` records each admin-triggered run and its summary.
- `source_records.source_key = 'vpa_public_register'` records freshness, row count and checksum.

Licensee and run tables use RLS. Authenticated users may read licensees; only users satisfying
`has_role(auth.uid(), 'admin')` may write licensees or access refresh runs. The route independently
checks the same role before performing any work.

## Manual refresh and parser verification

```sh
npm run refresh:vpa
npm run refresh:vpa:from-cache -- data/source/.vpa-cache/<run>
node --test tests/vpa-register-parse.test.mjs
```

The live scraper writes CSV and JSON outputs under `data/source/` by default. Review postcode
errors and any 50-record cap warnings before treating a run as complete.
