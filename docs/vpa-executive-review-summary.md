# VPA executive review summary

## Review and merge order

Review and merge `#33 → #34 → #35 → #36 → #37`. The current PR bases are
respectively `main`, `openclaw/vpa-register-hardening`,
`openclaw/vpa-staging-matching`, `openclaw/vpa-geocoding-cleanup`, and
`openclaw/vpa-profile-map`. No migration or application code in a parent PR
depends on a later PR.

Migration order is:

1. `20260730100000_vpa_licensees_and_update_run.sql` (already merged in #32,
   still unapplied)
2. `20260730110000_vpa_register_containment_and_status.sql` (#33)
3. `20260730120000_vpa_staging_matching_and_atomic_promotion.sql` (#34)
4. `20260730121000_vpa_raw_source_row_ledger.sql` (#34)
5. `20260730130000_vpa_lifecycle_geocoding_and_active_map.sql` (#35)
6. `20260730140000_vpa_licensee_entities_and_registry_search.sql` (#36)
7. `20260730150000_vpa_change_events_private_alerts_and_gdp_review.sql` (#37)

Rollback order is the reverse application/deployment order. Before any promotion,
prefer leaving additive empty schema in place and rolling back application code.
After promotion, use a verified database backup/restore or separately reviewed
compensating migration; never delete VPA history or attempt partial manual undo.

## PR-by-PR executive view

### #33 — containment and source/status correction

Adds a server-only fail-closed feature flag, completeness gates, reversible
licensee observation, and separate raw/normalised status and source verification.
Highest risk: the corrective schema semantics and admin/RLS write gates must align
with the already-merged `20260730100000` migration. A bad assumption could
mislabel registration state, but the PR does not itself match, close, or create
premises. Estimated focused review: 1.5–2.5 hours.

### #34 — staged matching and atomic promotion

Adds private run-scoped raw/staged evidence, conservative matching, review queues,
quarantine, dry-run reports, and the `SECURITY DEFINER`
`promote_vpa_import_run` write path. Highest risk: this is the canonical mutation
boundary. Address normalisation strips unit/shop tokens; fuzzy matching uses
same-postcode street/name/suburb similarity; proposed matches can therefore
duplicate a pharmacy, select the wrong shared-address record, or mistake a
trading-name change/relocation. Promotion also changes the observation state of
licensee relationships. Estimated focused review: 4–6 hours plus canonical
dry-run adjudication.

### #35 — lifecycle, geocode evidence, active-map safety

Adds explicit closed/reopened state, separate VPA/PBS state, auditable geocode
evidence, and active-map exclusion for explicitly closed premises. Highest risk:
the lifecycle trigger treats only an explicit normalised `closed` source value as
closure, but a bad upstream match would close the wrong canonical pharmacy and
set its VPA/PBS state to `closed_historical`. Expiry, inactive licensee, absence,
and incomplete snapshots do not close a premise. Estimated focused review:
2–3 hours.

### #36 — dossier, registry search, published-licensee network

Adds official registration presentation, bounded authenticated search, and
published-licensee entities/relationships without claiming beneficial ownership.
Highest risk: authenticated RLS/search exposure and name normalisation may
collapse distinct people with equivalent normalised published names. VPA/PBS
states remain separate; UI wording must not present licensees as owners.
Estimated focused review: 2.5–4 hours including privacy and UI review.

### #37 — change events, organisation-private alerts, GDP review evidence

Adds baseline-aware field changes, organisation-scoped watches/alerts, and
staging-only GDP comparisons. Highest risk: four `SECURITY DEFINER` trigger/helper
functions and alert RLS must not leak events across organisations or allow
untrusted callers to manufacture alerts. First promotion is baseline-only. GDP is
not recomputed or activated. Estimated focused review: 2.5–4 hours.

Total engineering/security review estimate: about 13–20 hours, plus the
data-dependent manual adjudication produced by the authorised canonical dry-run.

## Assumptions requiring human challenge

- One normalised structured address plus exact normalised name represents one
  canonical pharmacy.
- Unit/shop removal improves matching without collapsing distinct premises in a
  centre or medical complex.
- Same-postcode street similarity `≥0.70`, weighted score `≥0.84`, and lead
  `≥0.12` are sufficient for auto-acceptance.
- Exact name at a different address is a relocation candidate, not proof of
  relocation.
- A source premise with no safe candidate is genuinely new only after manual
  duplicate and relocation review.
- Explicit VPA `Closed` is authoritative for the correctly matched premise; an
  expired date, inactive licensee, or one-snapshot absence is not.
- VPA/PBS linkage is never inferred from VPA status alone and must survive
  canonical matching review.
- Published licensee-name equivalence is descriptive network analysis, not proof
  of ownership, corporate control, family relationship, banner, or franchise.

## Geocoding recommendation

Preferred first choice: a locally loaded, version-pinned Victorian authoritative
address dataset (Vicmap Address), subject to confirmation of the specific
download/service licence and attribution. It is Victoria-specific, described by
the Victorian Government as authoritative/current, supports reproducible local
matching and evidence retention, and avoids transmitting pharmacy addresses to a
third party. Expected address-point accuracy is strongest where the official
address matches; marginal request cost is effectively zero after ingestion.
Caching/retention should follow the selected dataset's licence, not an assumed
blanket permission.

Preferred national fallback: the downloadable Geoscape G-NAF release from
data.gov.au. It is the endorsed national geocoded address file, supports local
batch matching and reproducible retained identifiers/coordinates, and avoids
per-request fees. Its current End User Licence Agreement must be reviewed for
commercial use, redistribution, attribution, derivative-data, update, and
retention obligations before approval.

Commercial API fallback: a contracted Australian geocoding service with explicit
permanent-result storage rights, SLA, data-processing terms, and address-level
precision metadata. Accuracy and cost should be evaluated on a blinded pharmacy
fixture before selection. Do not approve a service merely because it is cheap.

Google Geocoding is not the preferred system of record: it is high-coverage and
pay-as-you-go, but its display, attribution, storage/caching, and service-specific
terms need legal/contract review and can constrain permanent retention or use
outside Google maps. It may be suitable as a manually reviewed secondary check,
not as the default retained canonical coordinate source without explicit approval.
Public Nominatim/OpenStreetMap endpoints are unsuitable for this bulk production
job because public-service usage limits and data/attribution obligations do not
provide the operational control required.

Official references:

- [Vicmap Address](https://www.land.vic.gov.au/maps-and-spatial/spatial-data/vicmap-catalogue/vicmap-address)
- [Victorian spatial-data licensing](https://www.land.vic.gov.au/maps-and-spatial/spatial-data/how-to-access-spatial-data/licensing)
- [G-NAF dataset](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf)
- [G-NAF End User Licence Agreement](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf/resource/09f74802-08b1-4214-a6ea-3591b2753d30)
- [Google Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Google Geocoding billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)

Recommendation: approve Vicmap Address for an offline proof of concept only after
the exact distribution licence is recorded; benchmark against G-NAF; bulk geocode
nothing until one source, licence, attribution, retention policy, update cadence,
and rejection thresholds are formally approved.

## Remaining blockers and first safe production dry-run

Blockers are human review of RLS and every `SECURITY DEFINER` function, approval of
the matching thresholds and lifecycle rules, an authorised minimum-field
production export, and approval of a geocoding dataset/licence. Production
migrations, Lovable publication, refresh execution, promotion, cleanup,
geocoding, and GDP recalculation remain paused.

A first production-representative dry-run becomes safe after #33 and #34 are
approved and merged onto protected `main`, their changed diff has been reviewed
after rebase, all six required checks pass, and an authorised operator creates
the encrypted minimum-field export described in
`docs/vpa-canonical-data-dry-run-review-package.md`. The dry-run itself remains
local/read-only and must not require production migrations. No promotion becomes
safe until #35–#37, geocoding, and all manual review gates are separately approved.

## Rebase and retest procedure after each merge

For the next PR only:

1. Fetch protected `main` and record its exact commit.
2. Capture `git diff --stat` and `git diff --name-status` for the child PR against
   its current parent head.
3. Rebase the child branch onto updated `origin/main` without rewriting any
   merged migration. Because public force-push is prohibited, publish a new
   successor branch/PR when a non-fast-forward update would be required, or merge
   protected `main` into the child branch and retarget it to `main`.
4. Verify only the child PR's intended commits/files remain and report any changed
   diff.
5. Run `npm run typecheck`, `npm run test`, `npm run lint`,
   `npm run lint:windows`, `npm run build`, and the clean Supabase
   reset/pgTAP/generated-type/database-lint workflow.
6. Confirm all required GitHub checks are green before requesting the next
   approval.

