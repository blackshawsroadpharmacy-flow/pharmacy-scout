# VPA canonical-data dry-run review package

This package is review-only. It does not apply migrations, stage a production run,
promote records, call a geocoder, enable the refresh route, publish Lovable, or
recalculate Geographic Dispensing Potential.

## Minimum authorised production export

Export one JSON object per canonical `pharmacy_premises` row with only:

- `id`
- `name`
- `address`
- `suburb`
- `postcode`
- `lat` and `lng`, derived from `location`, when present
- `premises_source`
- `vpa_record_key`, when already present
- `vpa_registration_status_normalised`, when already present
- the canonical PBS linkage/state identifier required to report VPA/PBS
  separation, but no PBS claims, volumes, notes, or commercial analysis

Exclude phone, email, website, free-text notes, profiles, documents, acquisition
records, organisation IDs, user IDs, alert watches, calibration evidence,
dispensing data, and any non-public contact or commercial information.

The safest export is a one-use, administrator-invoked `SECURITY INVOKER` database
function or a direct read-only SQL export executed through the authenticated
Supabase SQL editor by an authorised operator. The query should select the fields
above into a local JSON file, never expose a public endpoint, never use the
service-role key in a browser, and never copy the full production database.
Record the query, row count, export timestamp, SHA-256, operator, and source
database project reference in the private review log.

Store the export outside the repository in an encrypted local volume with owner
read/write permission only (`0600`). Do not upload it to GitHub, Lovable, chat,
issue attachments, or CI artifacts.

## Exact dry-run command

```sh
umask 077
npm run import:vpa-register -- \
  --file "/Volumes/1TB-SSD/OpenClaw-Workspace/blackshaws-pharmacy/inbox/pharmacy-owners/vpa-register-2026-07-29-live.csv" \
  --canonical "/absolute/private/path/pharmacy-premises-minimum.json" \
  --output "/absolute/private/path/vpa-canonical-review" \
  --dry-run
```

Expected files:

- `vpa-register-2026-07-29-live-b462a9b2156c.dry-run.json` — source audit,
  canonical input path, disposition counts, candidates, scores, factors, and
  conflicts
- `vpa-register-2026-07-29-live-b462a9b2156c.review.csv` — human-review queue
  with one disposition per source premise

Both are created with mode `0600`. Verify the source hash remains
`b462a9b2156c99c340ce89fe70a3ac79637d405942720a3f1506f22a9f415ffb`.

## Matcher rules and thresholds

Algorithm: `vpa-match-v1.0.0`.

- `exact_match` (`1.0`, auto-accepted): exactly one canonical row has the same
  normalised structured street/suburb/postcode and exact normalised name.
- `renamed_premises_candidate` (`0.92`, review required): exactly one canonical
  row has the same structured address, but the name differs.
- `ambiguous_match` (`0`, review required): more than one canonical row shares
  the exact structured address.
- Fuzzy candidates are restricted to the same postcode and require street-token
  similarity of at least `0.70`.
- Fuzzy score is `0.55 × street + 0.30 × name + 0.15 × suburb`.
- `high_confidence_match` (auto-accepted) requires score at least `0.84` and a
  lead of at least `0.12` over the next candidate.
- An exact normalised name at another address becomes
  `relocation_candidate`, never an automatic match.
- Remaining weak/competing address candidates become `ambiguous_match`.
- No safe candidate becomes `unmatched_new_premises`.

Name alone and proximity alone never auto-match. The current deterministic
matcher does not use coordinates for matching. Reviewers should specifically
challenge whether unit/shop stripping, street-token Jaccard similarity, and the
`0.84`/`0.12` thresholds are conservative enough for Victorian shopping centres,
shared addresses, relocations, and trading-name changes.

## Mandatory manual-review categories

Review every:

- renamed-premises candidate
- relocation candidate
- ambiguous or competing candidate
- shared-address record
- unmatched/proposed-new premise
- explicit closed premise
- VPA-only, PBS-only, unresolved, or conflicting VPA/PBS state
- duplicate source record or duplicate key
- quarantined/parser-error/cap-warning/undersized run
- unresolved, approximate, low-precision, or quarantined geocode
- source name/address/status conflict

Do not promote until all blocking rows are decided, approved new premises have
validated or existing coordinates, the source counts/hash are reconciled, and a
reviewer has confirmed that canonical phone, website, coordinates, notes,
profiles, documents, and organisation relationships remain untouched.

## Secure deletion after review

Retain the source VPA CSV according to its approved source-record policy. Delete
the production-derived canonical export and generated review reports after the
review decision and required audit facts have been recorded.

1. Confirm the files are outside Git and no copy exists in shell history, CI,
   cloud-sync, chat, screenshots, or editor recovery folders.
2. Record only non-sensitive audit facts: hashes, counts, command version,
   reviewer, timestamp, and approved decisions.
3. Move the export and generated reports to the operating-system Trash for
   recoverable deletion, then empty Trash under the organisation's retention
   policy. On SSDs, do not claim secure overwrite; rely on encrypted storage and
   cryptographic key/volume lifecycle.
4. Re-run `git status --ignored` and a filename/hash search to confirm no
   repository copy or artifact remains.

