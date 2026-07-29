# Update Pharmacy

> **Maintenance containment:** the refresh is disabled server-side unless
> `VPA_REFRESH_ENABLED=true` is explicitly configured in the server runtime. The administrator
> control remains visible but disabled while staging, matching and transactional promotion are
> under review.

Authenticated administrators will eventually refresh the Victorian Pharmacy Authority (VPA)
public register from the **Update Pharmacy** control in the application shell.

## Data flow

`POST /api/vpa/refresh` verifies the caller's Supabase bearer token and confirms an `admin` row in
`user_roles`. The first successful run consumes the bundled 29 July 2026 register snapshot. Later
runs query the VPA register server-side by Victorian postcode and stream progress to the browser as
server-sent events in the POST response. The browser never calls the VPA endpoint directly.

The containment layer rejects incomplete postcode coverage, capped responses, reported
fetch/parsing errors, materially undersized snapshots and duplicate source keys before canonical
data changes. Missing source rows and licensees are soft-marked as no longer observed; they are
never hard deleted. Full staged and transactional promotion is planned separately.

## Schema

- `pharmacy_premises.vpa_record_key` is a stable VPA source identity, not the sole canonical
  matching method.
- `pharmacy_premises.published_licensee_names` contains exact VPA-published registered licensee
  names. It does not establish beneficial ownership, proprietorship or control.
- `pharmacy_premises.proprietor_names` is deprecated compatibility data and must not be used by
  new code.
- Raw and normalised registration status, registration date, premises conditions, match state,
  observation dates and the successful source run are stored separately.
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

The live scraper writes CSV and JSON outputs under `data/source/` by default. Parser output is not
permission to promote canonical data. Any postcode error, result-cap warning, incomplete coverage,
invalid snapshot or duplicate source identity causes the server refresh to fail closed.
