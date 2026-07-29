# WP13 — Map stability, statewide search and deployment trust

## Delivery scope

Map/dossier stability shipped separately in PR #13. Ordinary marker and visible-list selection
changes only dossier selection; explicit search navigation remains the deliberate map-movement path.

This slice adds:

- `statewide_location_search(query, limit)`, a canonical, server-side search capped at 30 rows
- trigram indexes for pharmacy, supermarket and medical-centre names and addresses
- exact-name and prefix ranking ahead of fuzzy matches
- postcode and suburb matching for pharmacies
- organisation-filtered acquisition and candidate results for authenticated callers
- grouped keyboard-accessible results with `/`, arrows, Enter and Escape
- deliberate navigation from search results to pharmacy/external dossiers or private workflows
- safe build identity and public data-freshness metadata on `/about`

## Security and coverage

The RPC is `SECURITY DEFINER` so anonymous discovery search does not require access to canonical
tables. It selects only explicit public columns, never raw imports. Private branches require a
session and an explicit `is_org_member` check. PBS approval and VPA registration search are
deliberately absent until authoritative coverage exists.

Inputs shorter than two characters, longer than 120 characters, or containing control characters
return no results. The caller may request fewer rows, but cannot raise the server cap above 30.

External records remain OpenStreetMap discovery evidence. Their absence is not evidence that no
facility exists.

## Build identity

The About page shows:

- Git commit (resolved from the deployment environment or local Git at build time)
- build timestamp and environment
- public Supabase project reference
- latest canonical import timestamps
- ABS reference period
- migration/schema version

No API keys, service-role data, internal paths or credentials are included.

## Verification

- application contract tests cover bounds, cancellation, keyboard interaction, grouping and
  explicit versus ordinary selection
- pgTAP covers grants, indexes, hard limits, malformed input and anonymous private-result denial
- protected CI performs a complete migration reset, schema drift check and database lint
