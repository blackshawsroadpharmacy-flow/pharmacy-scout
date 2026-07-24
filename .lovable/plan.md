
# Phase 1.5 — Map-first redesign

Rebuild the frontend around a persistent full-screen map. Preserve the Phase 1 backend (auth, orgs, RLS, `pharmacy_premises`, `pbs_approvals`, `source_records`, acquisition tables, door-point RPC). No Location Rules engine yet.

## 1. Data — Victoria-wide pharmacy dataset

The brief asks for "the full Victorian pharmacy discovery dataset from HealthDirect or Geoscience Australia". Reality check:

- **HealthDirect Service Directory** — requires an API key registered to an organisation. Cannot be called from the browser and I can't provision a key on your behalf. If you have a key, add it as `HEALTHDIRECT_API_KEY` and I'll wire a server-side sync job.
- **Geoscience Australia National Health Services Directory / Foundation Spatial Data Framework** — no clean open bulk file for pharmacies at build time from this sandbox.
- **PBS Approved Suppliers register** (Dept. of Health) — publishes a periodic CSV/XLSX of every section 90 PBS-approved pharmacy in Australia with name, address, suburb, postcode, state, approval number. This is the practical Victoria-wide dataset available without keys, and it is regulatorily meaningful (PBS approvals — a Commonwealth authoritative source).

**Proposed approach:** ingest the PBS Approved Suppliers register (VIC rows only) at migration time via a server-side importer:
1. Server function `syncPbsApprovedSuppliers` (admin-only) fetches the current PBS register file, filters state=VIC, geocodes each address via OSM Nominatim (respecting rate limits) server-side, and upserts rows into `pharmacy_premises` with `premises_source='pbs_register'`, plus a `pbs_approvals` row with `approval_status='verified'` and the approval number.
2. One `source_records` snapshot per run.
3. I'll run this once during the redesign so the map opens with ~1,300+ real VIC pharmacies.

If you'd prefer HealthDirect, tell me and provide the key — I'll swap the adapter.

## 2. Route structure

```
/                      full-screen map, anonymous OK (was landing)
/about                 old landing content, demoted
/auth                  unchanged
/app/acquisitions      pipeline (still available; also surfaces as map layer + left panel)
/app/data-sources      admin/transparency screen
/app/onboarding        shown only when user first tries to save private work
```

`/app/*` remains auth-gated. `/` is public and does not redirect.

## 3. Map shell (`/`)

- Full-viewport React Leaflet, Carto Positron tiles with OSM Standard fallback (tile-error handler swaps `TileLayer` URL).
- Initial view: centre `[-37.05, 144.8]`, zoom 6 (all VIC visible).
- Marker clustering via `react-leaflet-cluster` (leaflet.markercluster under the hood).
- Server function `listPremisesLite` returns compact `{id, lat, lng, status}` for viewport-bounded queries; full dossier fetched on click.
- Marker colours: navy (discovery), teal (PBS+VPA verified), amber (partial/conflict), purple (saved acquisition), blue outline (selected), red reserved for regulatory conflict.
- Progressive reveal: clusters at zoom ≤11, individual markers above.

## 4. Chrome around the map

**Top bar (compact, 48px):** logo · address/suburb/postcode/approval-number search (client-side fuzzy over loaded set + Nominatim fallback for suburbs) · mode selector (Explore · Acquisition · Greenfield · Relocation) · layer control button · saved (auth-gated) · sign-in / user menu.

**Left panel (collapsible, 320px):** context-sensitive.
- Explore: filter form (verification, PBS known, VPA known, metro/regional, nearest-pharmacy distance, missing data, saved) + result count for current viewport + "Search this map area" button after pan.
- Acquisition: pipeline board condensed to a stage list with counts; clicking a card flies to marker.
- Greenfield: click-to-place candidate; shows distance rings (1km/1.5km/2km), nearby pharmacies list, "select possible rule pathway" chooser (no auto-evaluation yet).
- Relocation: origin picker (existing pharmacy) → destination picker (click map); shows straight-line distance, competing pharmacies within radius.

**Right dossier (400px, slide-in):** name, address, source badges, verification badges, distance to nearest pharmacy, nearby pharmacies/medical centres/supermarkets ("No source coverage" placeholders in Phase 1.5 for supermarkets/medical centres), demographic summary placeholder, "Save to watchlist" / "Add as acquisition target" / "Analyse relocation from here" actions. Unauthenticated action → inline sign-in prompt sheet; after auth → onboarding if no org, then completes the intended save.

## 5. Auth-on-save

- `useRequireAuth()` hook wraps every save action. If no session, opens an inline auth sheet (email/password + Google) with `returnTo` state.
- After successful auth, if `profile.current_organisation_id` is null, show inline org-create sheet (single input), then replays the pending action.

## 6. Marker & layer performance

- Server fn returns lite markers filtered by bbox + zoom-based decimation.
- Layer control toggles: Pharmacies, Verified PBS, Verified VPA, Saved acquisitions, Candidate greenfield sites. Supermarkets/medical centres/hospitals/shopping centres/population/planning layers render "No source coverage" empty states in Phase 1.5 — schema hooks are there, adapters land in Phase 2.
- Marker cluster + `preferCanvas: true` on the map for large-marker perf.

## 7. Files to add / change

New:
- `src/routes/index.tsx` — rewrite as full-screen map shell (replaces landing).
- `src/routes/about.tsx` — old landing content.
- `src/components/map/` — `MapShell`, `TopBar`, `LeftPanel`, `RightDossier`, `LayerControl`, `ModeSwitch`, `AuthSheet`, `MarkerLayer`, `ClusteredMarkers`, `SearchBox`.
- `src/lib/pbs-import.functions.ts` + `.server.ts` — PBS register fetch + Nominatim geocode + upsert.
- `src/lib/premises.functions.ts` — add `listPremisesLite({bbox, filters})`.
- `src/hooks/use-require-auth.tsx`.

Changed:
- `src/routes/app.tsx` — keep gate for `/app/*` only.
- `src/routes/app.index.tsx` — remove (map lives at `/`); redirect to `/`.
- `src/routes/app.acquisitions.tsx` — retain as secondary route, restyle to complement map.
- `src/styles.css` — top bar, floating panels, marker colours.

Deps: `bun add react-leaflet-cluster leaflet.markercluster @types/leaflet.markercluster`.

## 8. Migrations

- One migration: add `pbs_approval_number` unique index; add `pharmacy_premises.state` column (default 'VIC'); add `listPremisesLite` supporting bbox index (`CREATE INDEX ... USING GIST (location)` if not present).
- Then run PBS importer once (admin server fn) to backfill VIC pharmacies.

## 9. Not in this phase

Location Rules engine, real Overpass POI ingestion, ABS demographic joins, planning-alerts feed, financial modelling. All surfaced as "No source coverage" placeholders wired to the same layer/dossier components so Phase 2 plugs in.

## 10. Confirmations I need before building

1. **Data source:** OK to use the PBS Approved Suppliers register (VIC) as the initial Victoria-wide dataset? Or do you have a HealthDirect API key you'll add as a secret?
2. **Geocoding:** OK to use OSM Nominatim server-side with rate limiting (~1 req/sec, one-off import ~25 min for VIC)? Alternative is you provide a Mapbox/Google geocoding key.
3. **Landing page:** move to `/about` or delete entirely?

Reply "go" with answers to 1–3 and I'll build.
