# Public pharmacy data contract

This contract is the allow-list for anonymous Pharmacy Scout reads. It is
deliberately narrower than `public.pharmacy_premises`. A field is not public
merely because one upstream register is public.

## Public interfaces

Anonymous callers may use only:

- `pharmacy_points_in_viewport(...)`: Victorian bounds, maximum 2,000 rows,
  active-map lifecycle filtering, explicit marker fields;
- `statewide_location_search(text, integer)`: validated query, maximum 30
  results, explicit result fields;
- `public_pharmacy_dossier(uuid)`: zero or one explicit dossier row; and
- existing narrowly bounded public location/context functions documented in
  `docs/repo-map.md`.

Anonymous callers cannot select `pharmacy_premises`,
`pharmacy_premises_geo`, or `pharmacy_premises_vpa_lifecycle` directly.

## Audited consumers

| Consumer                           | Access after hardening                                               | Bound                                                  |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| Public map markers                 | `pharmacy_points_in_viewport`                                        | Victorian rectangle; 1–2,000 rows                      |
| Statewide search                   | `statewide_location_search`                                          | 2–120 character query; maximum 30 rows                 |
| Public dossier/profile             | `public_pharmacy_dossier`                                            | One caller-supplied UUID; zero or one row              |
| VPA registry search                | `vpa_registry_search`                                                | Authenticated only; bounded limit/offset               |
| Candidate nearest pharmacies       | `candidate_nearest_pharmacy`                                         | Victorian point; maximum 20 rows                       |
| Candidate radius pharmacies        | `candidate_pharmacies_within_radius`                                 | Victorian point; radius 100–20,000 m; maximum 500 rows |
| Candidate/site context             | `candidate_site_analysis` and explicit external-location RPCs        | Victorian point and bounded radius/category            |
| Location-rule evaluation           | Authenticated scenario functions and public rule metadata            | No anonymous canonical-row projection                  |
| Competitor/GDP context             | Explicit aggregate/context tables and bounded RPC outputs            | No anonymous canonical base-table read                 |
| Authenticated calibration selector | Direct authenticated base-table projection of ID/name/address/suburb | Authentication policy required                         |
| Acquisition/scenario workflows     | Organisation-scoped tables/functions                                 | Organisation RLS required                              |

The candidate/location functions are `SECURITY DEFINER` because their public
aggregates require canonical inputs after the base-table revoke. Migration
152000 gives each a fixed `public, extensions, pg_temp` search path. Their
signatures return explicit columns or aggregate JSON and retain their existing
geographic, radius, category and result-count validation.

## Column classification

| `pharmacy_premises` column           | Classification                | Public treatment                                               |
| ------------------------------------ | ----------------------------- | -------------------------------------------------------------- |
| `id`                                 | public required               | Marker, search and dossier identity                            |
| `name`                               | public required               | Marker, search and dossier                                     |
| `address`                            | public required               | Marker, search and dossier                                     |
| `suburb`                             | public required               | Marker, search and dossier                                     |
| `postcode`                           | public required               | Marker, search and dossier                                     |
| `locality_name`                      | public required               | Marker and dossier                                             |
| `location`                           | public required               | Returned only as latitude/longitude through bounded interfaces |
| `public_door_location`               | public required               | Returned only as dossier latitude/longitude                    |
| `door_source`                        | internal/system only          | Not public                                                     |
| `door_confidence`                    | internal/system only          | Not public                                                     |
| `door_verified_at`                   | internal/system only          | Not public                                                     |
| `door_verified_by`                   | organisation/private identity | Never public                                                   |
| `vpa_registration_status`            | public required               | Legacy display verification state                              |
| `vpa_registration_checked_at`        | authenticated only            | Not public                                                     |
| `vpa_source_id`                      | administrator only            | Never public                                                   |
| `premises_source`                    | public required               | Coarse source category only                                    |
| `source_confidence`                  | public required, sanitised    | Only `verified`, `approximate`, or unavailable                 |
| `source_id`                          | administrator only            | Never public; approved provenance is joined in dossier         |
| `phone`                              | public required               | Dossier                                                        |
| `website`                            | public required               | Dossier                                                        |
| `notes`                              | authenticated/internal        | Never public                                                   |
| `created_at`                         | internal/system only          | Not public                                                     |
| `updated_at`                         | internal/system only          | Not public                                                     |
| `geocode_method`                     | public required, sanitised    | Only `address_level`, `suburb_centroid`, or unavailable        |
| `vpa_record_key`                     | administrator only            | Never public                                                   |
| `proprietor_names`                   | administrator/internal        | Never public; it is not a safe ownership assertion             |
| `vpa_last_synced_at`                 | administrator/internal        | Never public                                                   |
| `published_licensee_names`           | authenticated only            | Anonymous users receive a sign-in-required state               |
| `vpa_match_status`                   | administrator/reviewer only   | Never public                                                   |
| `vpa_source_verification_status`     | public required               | Coarse VPA source disclosure                                   |
| `vpa_registration_status_raw`        | public required               | Official published wording                                     |
| `vpa_registration_status_normalised` | public required               | Lifecycle presentation                                         |
| `vpa_registered_until`               | public required               | Neutral registration-date presentation                         |
| `vpa_premises_conditions_raw`        | public required               | Official published conditions                                  |
| `vpa_first_observed_at`              | public required               | Source history disclosure                                      |
| `vpa_last_observed_at`               | public required               | Source history disclosure                                      |
| `vpa_last_successful_run_id`         | administrator only            | Never public                                                   |
| `vpa_snapshot_reference_date`        | public required               | Source reference date                                          |
| `vpa_currently_observed`             | administrator/reviewer only   | Never public                                                   |
| `vpa_source_row_fingerprint`         | internal/system only          | Never public                                                   |
| `vpa_match_method`                   | administrator/reviewer only   | Never public                                                   |
| `vpa_match_confidence`               | administrator/reviewer only   | Never public                                                   |
| `vpa_review_status`                  | administrator/reviewer only   | Never public                                                   |
| `vpa_official_name`                  | public required               | Official VPA presentation                                      |
| `vpa_official_full_address`          | public required               | Official VPA presentation                                      |
| `vpa_closed_first_observed_at`       | authenticated/internal        | Not public; normalised status is exposed                       |
| `vpa_reopened_last_observed_at`      | authenticated/internal        | Not public; normalised status is exposed                       |
| `vpa_geocode_status`                 | administrator/reviewer only   | Never public                                                   |
| `vpa_pbs_match_state`                | public required               | Explicit VPA/PBS distinction                                   |

PBS dossier output is restricted to approval number and approval status.
Source provenance is restricted to source name, public URL and fetched date.
No source checksum, raw row, run ID, matching evidence, review queue, geocode
evidence, alert/watch, GDP comparison, note, document, acquisition, calibration
or organisation relationship is exposed.

## Public behaviour

- Closed and historical premises are excluded from the default viewport.
- A known historical dossier may still be opened by its canonical ID; it is not
  silently treated as active.
- Registered-licensee rows remain authenticated. Anonymous presentation must
  say sign-in is required, not claim that no licensee is published.
- Public location quality is deliberately coarse. Provider evidence and
  administrative geocode state remain private.

## Deployment and rollback

Apply `20260730152000_public_pharmacy_access_hardening.sql` only after migrations
100000 through 151000 and only after backup/rollback approval. Deploy the
application query change with the migration so dossiers use
`public_pharmacy_dossier`.

Before VPA promotion, rollback is application rollback plus a reviewed
compensating grant migration if necessary. Do not restore anonymous
base-table access as an emergency shortcut; restore the prior application and
use a narrowly scoped compatibility function instead.
