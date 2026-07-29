# VPA production-readiness handoff — 30 July 2026

## Safety state

- Protected `main` at sprint start: `7dca39c9de7973886b1cb0dad6eaf274ea5ad7f0`.
- Production remains unchanged. No VPA migration, import, refresh, geocode, cleanup,
  GDP recomputation, or Lovable publication was performed.
- The production refresh remains unavailable in the published build. PR #33 also
  makes the server route fail closed unless the server-only
  `VPA_REFRESH_ENABLED=true` flag is deliberately configured.
- GDP remains unchanged. The new GDP comparison table is staging-only and cannot
  activate or validate a model.

## Source audit

The source used without modification was:

- Absolute path:
  `/Volumes/1TB-SSD/OpenClaw-Workspace/blackshaws-pharmacy/inbox/pharmacy-owners/vpa-register-2026-07-29-live.csv`
- File size: 827,722 bytes
- SHA-256:
  `b462a9b2156c99c340ce89fe70a3ac79637d405942720a3f1506f22a9f415ffb`
- Source URL: `https://pharmacy.vic.gov.au/register-search/`
- Scrape timestamp: `2026-07-29T13:34:38.613Z`
- The host file is byte-identical to
  `data/source/vpa-register-2026-07-29-live.csv`; no second repository copy was
  created.

Observed counts:

- 2,436 CSV rows
- 1,606 distinct premises
- 1,605 distinct structured addresses
- 2,423 named licensee relationship rows
- 1,672 distinct exact published licensee names
- 13 premises with no named licensee
- 1,605 premises published as `Active`; one as `Closed`; no unknown premises status
- 2,417 licensee rows published as `Active`; six as `Inactive`; 13 blank because
  the premises has no named licensee
- three byte-equivalent duplicate CSV rows
- 506 premises with multiple registered licensees
- 392 exact published licensee names associated with multiple premises
- no malformed dates, invalid Victorian postcodes, missing premises address
  components, conflicting grouped premises rows, or unknown source statuses
- 1,513 premises rows and 2,423 named-licensee rows with published conditions

`distinct addresses = 1,605` is one less than premises because two source premises
share a structured address. They are not automatically merged.

Private machine-readable reports (mode `0600`) are outside the repository:

- `inbox/pharmacy-owners/reports/vpa-register-2026-07-29-live-b462a9b2156c.dry-run.json`
- `inbox/pharmacy-owners/reports/vpa-register-2026-07-29-live-b462a9b2156c.review.csv`

## Pull-request stack

Merge and review in this order:

1. PR #33 — containment and status correction  
   <https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/33>  
   Migration: `20260730110000_vpa_register_containment_and_status.sql`  
   Depends on the already-merged but unapplied `20260730100000` migration.
2. PR #34 — staged audit, matching, raw-row ledger, and atomic promotion  
   <https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/34>  
   Migrations: `20260730120000` then `20260730121000`.
3. PR #35 — lifecycle and geocode evidence  
   <https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/35>  
   Migration: `20260730130000`.
4. PR #36 — dossier, published-licensee entities, and bounded registry search  
   <https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/36>  
   Migration: `20260730140000`.
5. PR #37 — baseline-aware change events, private alerts, and GDP review evidence  
   Migration: `20260730150000`.

Each PR is stacked on the preceding branch. RLS, `SECURITY DEFINER`, admin writes,
canonical matching, and lifecycle transitions require human review. Do not merge a
child before its parent.

## Dry run

The deterministic source-only command is:

```sh
npm run import:vpa-register -- \
  --file "/Volumes/1TB-SSD/OpenClaw-Workspace/blackshaws-pharmacy/inbox/pharmacy-owners/vpa-register-2026-07-29-live.csv" \
  --dry-run
```

Use `--canonical <admin-export.json>` to calculate production-relevant matches.
The export must contain only the minimum canonical pharmacy identity, structured
address, postcode, and coordinate fields and must be handled as private data.

The source-only run assigns all 1,606 premises
`unmatched_new_premises` because no canonical pharmacy dataset was supplied. That
is a completeness check, **not** a production impact prediction. Exact matches,
high-confidence matches, renamed candidates, relocations, ambiguous matches,
proposed new premises, VPA/PBS mismatches, and geocoding workload must be reported
again against an authorised current canonical export before promotion.

Every source premises receives exactly one disposition. Name alone and proximity
alone never produce an automatic match. Ambiguity, relocation, conflicting
addresses, duplicate source keys, incomplete coverage, parser errors, cap
warnings, and unresolved blocking reviews fail closed.

## Promotion and rollback

`promote_vpa_import_run(run_id)`:

- requires an authenticated administrator and a validated, complete run;
- obtains a transaction-scoped advisory lock and is idempotent by run;
- rejects unresolved blocking reviews and invalid source counts;
- preserves canonical trading name, address, phone, website, coordinates, notes,
  profiles, documents, and acquisition relationships;
- writes official VPA identity into separate fields;
- creates only approved new premises;
- retains historical licensee relationships and changes `currently_observed`
  atomically;
- updates source freshness and audit state in the same transaction; and
- rolls the entire operation back if any canonical step fails.

Before production:

1. Review and merge PRs #33–#37 in order with all required checks green.
2. Back up the production database and record the protected-main deployment SHA.
3. Apply migrations in timestamp order in a maintenance window. Keep
   `VPA_REFRESH_ENABLED` absent/false.
4. Export minimum canonical matching fields through an approved administrator
   path and run the dry-run locally or in an isolated staging project.
5. Review every ambiguous, relocation, shared-address, closed, VPA/PBS mismatch,
   proposed-new, and unresolved-geocode row.
6. Load the reviewed run into staging, verify counts and file hash, and retain its
   immutable report.
7. Promote only the approved run through the transactional function.
8. Verify canonical counts, preserved relationships, source freshness, map
   defaults, profiles, and alerts before enabling any live refresh.
9. Publish Lovable separately and verify desktop/mobile/auth/network behaviour.

Rollback is deployment rollback plus database restore for a completed promotion.
Do not delete historical VPA rows. Before promotion, the stack can be rolled back
by reverting the application deployment and leaving the additive, empty tables in
place. A partially completed promotion cannot commit.

## Lifecycle and geocoding

- Explicit `Closed` is a reversible historical state, not source verification.
- Closed premises remain in canonical history and are excluded from the default
  active map and active commercial competition.
- Absence, an expired date, an inactive licensee, or an incomplete snapshot does
  not close a premise.
- Reopening is timestamped from the observation; no closure date is fabricated.
- A new active premise must have either validated coordinates or explicit
  `unresolved` geocoding state.
- Geocode evidence retains query, provider/result identity, returned address,
  accuracy, confidence, timestamp, and review status. Outside-Victoria,
  postcode/suburb-conflicting, centroid-only, null/zero, low-precision, and
  implausibly duplicated coordinates are rejected or quarantined.
- No geocoding provider was called during this sprint. Therefore actual geocoding
  coverage remains zero and unresolved workload is not yet a production count.

## Profiles, search, and licensee intelligence

- The existing `PharmacyIntelligence` dossier gains separate “Official
  registration” and “Registered licensees” panels.
- Raw status remains visible; “verified” is never presented as registration status.
- Date wording instructs users to confirm renewal status and does not imply closure.
- No placeholder licensee is created for the 13 premises-only rows.
- Canonical published-licensee entities retain exact display and deterministic
  comparison names, first/last observation, current/historical premise counts,
  suburbs, and duplicate-review state.
- These entities do not establish ownership, beneficial ownership, family,
  corporate, banner, or franchise control.
- Registry search is authenticated, server-side, bounded, and paginated. It does
  not send the statewide licensee registry to the browser.
- VPA registration and PBS approval remain separate states.

## Change events and alerts

- The first successful run establishes a baseline and creates no false
  new/removed alerts.
- Later snapshots create field-level premise and licensee events.
- Alerts fan out only to organisations with a watch and are protected by
  organisation RLS.
- Registration-date reminders, when added to the scheduler, must use the wording:
  “Published registration date is due within X days. Confirm current renewal
  status with the Victorian Pharmacy Authority.”
- GDP comparisons retain the exact run and before/after evidence in staging only.
  Estimated Daily Scripts remains experimental, assumption-based, and unvalidated.

## Verification and known limitations

Local verification includes clean migration resets through the full stack,
pgTAP behavioural checks, generated-type parity, database lint, 120 Node tests,
and 26 Vitest tests. GitHub status and exact heads must be read from each PR before
merge; never infer green checks from local results.

Remaining required human/staging work:

- authorised canonical-data dry-run and adjudication of every review class;
- actual geocoding under an approved provider/dataset licence;
- production impact and duplicate CSV derived from that canonical dry-run;
- visual screenshots with authenticated fixture data for active, closed, VPA-only,
  PBS-only, multiple/no-licensee, ambiguous, desktop, and mobile states;
- final accessibility/console/network review after Lovable publication;
- review of all RLS, fixed-search-path security-definer functions, admin writes,
  matching thresholds, and lifecycle transitions.

No screenshot is claimed from source-only data: the safe local database contains
no fabricated canonical VPA premises, and production was deliberately not copied
or mutated.
