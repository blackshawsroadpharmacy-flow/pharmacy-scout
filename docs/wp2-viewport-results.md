# WP2 viewport-scoped results

WP2 was merged through protected pull requests
[#7](https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/7) and
[#8](https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/8), followed by the
pharmacy-marker regression fix in
[#9](https://github.com/blackshawsroadpharmacy-flow/pharmacy-scout/pull/9).

## Behaviour

- Pharmacy, supermarket and medical-centre discovery records are queried independently inside the
  current map bounds.
- Map movement is debounced by 250 ms.
- Identical requests share one in-flight operation. New bounds abort older transport requests and
  stale results are rejected before reaching the map/list state.
- Pharmacy discovery responses are capped at 500 rows. `total_count` preserves the true number of
  matching records and the UI discloses truncation.
- The map and result list use the same viewport collection. Full pharmacy dossier data is fetched
  only after selection.
- Empty results, errors, loading, source coverage, request duration and payload size are explicit.
- PBS and VPA controls remain hidden until authoritative register data exists.

## Production measurements

Measurements were taken from Melbourne against the production Supabase RPC after migration:

| View | Returned / total | Payload | Observed median |
| --- | ---: | ---: | ---: |
| Statewide low zoom | 500 / 922 | 188,923 bytes | 397.8 ms |
| Melbourne metro | 500 / 717 | 189,018 bytes | 298.9 ms |
| Melbourne CBD | 56 / 56 | 21,303 bytes | 178.8 ms |
| Inner CBD | 33 / 33 | 12,682 bytes | 182.1 ms |

The previous unconditional statewide query returned 922 full rows, transferred 669,061 bytes and
took 1,576.9 ms in the same end-to-end network environment. These timings include public network
latency and are not database execution-only benchmarks.

## Verification

- Required checks: build, test, lint and Supabase migrations/schema drift.
- Desktop viewport: 1440 × 900.
- Mobile viewport: 390 × 844.
- Browser verification covered one initial request, map/list synchronisation, selection-scoped
  dossier loading, Leaflet survival, console errors and horizontal overflow.
- Production frontend evidence must be captured again after Lovable publishes protected `main`.

