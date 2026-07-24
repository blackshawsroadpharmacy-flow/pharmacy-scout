
# Chemist Care Pharmacy Opportunity Scout — Phase 1 Plan

Per your delivery instruction, this plan covers the four required pre-build items (architecture, migrations, source-viability assessment, real-data fallback) and then the concrete Phase 1 implementation. I'll stop after Phase 1 for review — no Rules engine, no Greenfield Explorer, no Relocation Studio.

## 1. Architecture summary

**Stack**
- TanStack Start (React 19, TS strict, Vite 7) — already scaffolded.
- Tailwind v4 + shadcn/ui with the Chemist Care palette baked into `src/styles.css` as semantic tokens (deep navy `#10183f`, warm off-white `#f8f9fc`, teal accent, amber "missing evidence", red only for clear fail). Inter loaded via a `<link>` in `__root.tsx` head (Tailwind v4 rule).
- Lovable Cloud (Supabase) for Auth, Postgres + PostGIS, Storage, RLS.
- React Leaflet via `npm` (no CDN), OSM tiles for the base map. No provider API keys in the browser.
- Server-only reads/writes through `createServerFn` + `requireSupabaseAuth`; admin work (CSV import commit, source snapshots) via `supabaseAdmin` loaded inside handlers.
- Roles in a separate `user_roles` table + `has_role()` SECURITY DEFINER. Org membership in `organisation_members`.

**Tenancy model**
- `organisations` + `organisation_members(user_id, org_id, role)`.
- Every private table has `organisation_id` and RLS: "member of that org".
- Public/shared discovery tables (`pharmacy_premises` sourced from HealthDirect, `source_records`) are readable by any authenticated user but writable only by admins.

**Separation of concerns (matches your regulatory distinction)**
- `pharmacy_businesses` — commercial/acquisition entity (private per org).
- `pharmacy_premises` — physical premises with address centroid + `public_door_location` (separate PostGIS points), `vpa_registration_status` (independent), `premises_source`, `source_confidence`.
- `pbs_approvals` — Commonwealth PBS section 90 approvals, linked to premises but never inferred from VPA or HealthDirect.
- `candidate_sites` — greenfield/relocation site candidates (Phase 2+ uses these; schema laid down now).
- `opportunities` — user's tracked opportunity (acquisition | greenfield | relocation) with pipeline stage.
- `source_records` — every ingested dataset snapshot (name, url, licence status, fetched_at, valid_until, coverage geometry, row_count, checksum).

Verification is always explicit: a premises is only "VPA registered" if a row in `source_records` of type `vpa_register` matched it, and only "PBS approved" if a `pbs_approvals` row exists with `approval_status='verified'` linked from a `pbs_register` source.

## 2. Proposed migrations (Phase 1)

One migration enabling PostGIS + creating enums, tables, RLS, grants, `has_role`, plus the seed source_records rows.

**Enums**
- `app_role` — `admin`, `member`.
- `opportunity_type` — `acquisition`, `greenfield`, `relocation`.
- `pipeline_stage` — `watchlist`, `contacting`, `im_received`, `due_diligence`, `offer`, `passed`, `acquired`.
- `verification_status` — `unverified`, `matched`, `verified`, `conflict`.
- `door_source` — `geocoded`, `osm`, `user_verified`, `imported`.
- `premises_source_type` — `healthdirect`, `osm`, `vpa_register`, `pbs_register`, `manual`.

**Tables**
- `organisations(id, name, created_at, created_by)`
- `organisation_members(org_id, user_id, role, joined_at)` — PK (org_id,user_id)
- `profiles(id=auth.uid, display_name, current_org_id, created_at)`
- `user_roles(id, user_id, role app_role)` + `has_role(uuid, app_role)` SECURITY DEFINER
- `source_records(id, source_name, source_url, licence_or_terms_status, fetched_at, valid_until, coverage_geometry geography, row_count, checksum, notes)`
- `pharmacy_premises(id, name, address, suburb, postcode, locality_name, location geography(Point), public_door_location geography(Point), door_source, door_confidence, door_verified_at, door_verified_by, vpa_registration_status verification_status, vpa_registration_checked_at, vpa_source_id → source_records, premises_source premises_source_type, source_confidence, source_id → source_records, created_at, updated_at)`
- `pbs_approvals(id, premises_id, approval_number, approval_status verification_status, original_rule_item, original_approval_date, original_town, approval_source_id → source_records, source_confidence, notes)`
- `pharmacy_businesses(id, organisation_id, trading_name, premises_id nullable, opportunity_status, asking_price numeric, broker_or_source, private_notes, created_by, created_at, updated_at)` — RLS org-scoped
- `candidate_sites(id, organisation_id, address, location geography(Point), public_door_location geography(Point), site_type, listing_url, rent numeric, area_sqm numeric, planning_use_status, notes, created_by, created_at)` — RLS org-scoped
- `opportunities(id, organisation_id, type opportunity_type, business_id nullable, candidate_site_id nullable, origin_approval_id nullable, pipeline_stage pipeline_stage, title, summary, created_by, created_at, updated_at)` — RLS org-scoped

**RLS + GRANT**
- Every public-schema table: `GRANT` to `authenticated` (+ `service_role`); no `anon` grants.
- Private tables: policies use `EXISTS (organisation_members WHERE user_id=auth.uid())`.
- Discovery tables (`pharmacy_premises`, `pbs_approvals`, `source_records`): `SELECT` to any authenticated user; `INSERT/UPDATE` restricted to `has_role(auth.uid(),'admin')`, except users may `UPDATE` only `public_door_location`, `door_source='user_verified'`, and door-verified metadata (enforced via a `SECURITY DEFINER` RPC `set_premises_door(premises_id, lat, lng)`).
- Trigger: on new `auth.users`, insert `profiles` row.

## 3. External sources — viability & fallback

| Source | Phase 1 use | Status | Fallback |
|---|---|---|---|
| **VPA public register** | Authoritative for VIC licence + premises registration | No public bulk API; scraping in-browser is disallowed by the brief. | Ship an **admin CSV import workflow** (upload → map columns → reconcile against `pharmacy_premises`). Snapshot in `source_records`. Placeholder in Phase 1: schema + upload UI stubbed; no records marked "VPA registered" until an admin uploads. |
| **PBS approvals** | Authoritative for section 90 approvals | Same — no clean licensable API for automatic ingest at build time. | Same CSV admin flow, separate `source_records` row of type `pbs_register`. No premises labelled PBS-approved until matched. |
| **HealthDirect Service Directory** | Discovery of likely pharmacy locations | Public API exists but requires an API key registered to an organisation; cannot be called from the browser and cannot be embedded here without your key. | Phase 1 uses a **server function adapter** with a `HEALTHDIRECT_API_KEY` secret. Until you add the key, we seed a small set of **real, publicly listed pharmacy addresses** in the Camberwell/Hawthorn/Kew/Balwyn/Glen Iris area, geocoded via OSM Nominatim (fetched at seed time), each row explicitly marked `premises_source='healthdirect'` snapshot OR `premises_source='manual'` demonstration, with `vpa_registration_status='unverified'` and no PBS approval. Every seeded row links to a `source_records` entry with `fetched_at` and a note that it's a discovery record. |
| **OpenStreetMap tiles** | Base map | Fine under OSM tile usage policy at low volume; attribution shown. | Direct tile URL with proper attribution; no key needed. |
| **OSM Overpass (supermarkets/GPs/hospitals)** | Discovery signals for later phases | Not needed in Phase 1. | Deferred. |
| **ABS, PlanningAlerts, foot-traffic, council planning** | Phase 2+ | Deferred; brief says provider adapters only. | Not implemented Phase 1. |

Nothing is fabricated. Anywhere data is absent, the UI shows "Unknown" / "No source coverage" / "Unverified discovery record", never zero.

## 4. Phase 1 UI

Routes (TanStack file-based):
- `/` — public marketing/landing with sign-in CTA + disclaimer footer.
- `/auth` — email/password + Google sign-in (integration-managed).
- `/_authenticated/route.tsx` — managed gate (already scaffolded by integration).
- `/_authenticated/onboarding` — create or join an organisation on first login.
- `/_authenticated/map` — **Opportunity Map** (default post-login home). Leaflet full-height, layer toggles (Premises / Verification status / Candidate sites), mode switch (Acquisition/Greenfield/Relocation — Phase 1 only Acquisition is interactive; the others show "Available in Phase 2"), right-side dossier sheet with source, fetched date, verification badges, door-point editor.
- `/_authenticated/acquisition` — **Acquisition Scout**: pipeline board (7 columns), manual "Add business" dialog, CSV import (download template + upload + column-map + preview), private notes editor. Market-opportunity vs private-financial-analysis panels visually separated; the latter shows "Commercial data required" until Phase 2.
- `/_authenticated/data-sources` — **Data & Sources** table listing every `source_records` row: source, purpose, last refresh, coverage, records, licence status, confidence, "Import snapshot" action (admin only) for VPA + PBS CSVs.

Shared:
- `AppShell` — dark navy sidebar (Map, Acquisitions, Data & Sources, Settings), Inter, rounded-xl cards, subtle borders.
- `DisclaimerFooter` — the exact disclaimer text, rendered inside `_authenticated/route.tsx` so it appears on every authenticated screen.
- Language helpers: badge components use only the approved vocabulary. No `Eligible`. No "underperforming" strings anywhere in code.

## 5. Acceptance-test mapping

Each of the 15 tests maps to a specific implemented behaviour (org creation on onboarding, discovery-only labelling, door-point correction RPC, RLS-protected notes, "Unknown" fallbacks, "No source coverage" banner on the map when panning outside seeded area, disclaimer in `_authenticated` layout, tablet layout via Tailwind `md:` breakpoints, no console errors).

## 6. What Phase 1 does NOT ship

- No rule engine tables (`rules`, `rule_versions`, `rule_requirements`, `rule_evaluations`, `evidence_items`, `measurement_records`) — deferred to Phase 2 as instructed.
- No Greenfield Explorer, Relocation Studio, Evidence Dossier screens.
- No routing/distance engine, no scoring.
- No financial-snapshot table (kept out until Phase 3 where private financials matter).

## 7. Implementation order

1. Enable Lovable Cloud.
2. Migration: PostGIS + all Phase 1 tables + enums + RLS + grants + `has_role` + profile trigger + seed `source_records`.
3. Seed Camberwell-area discovery premises via a one-off admin script that geocodes real public addresses through OSM Nominatim server-side and inserts rows with proper source attribution.
4. Design system: Chemist Care palette in `src/styles.css`; Inter link in `__root.tsx`; shared UI primitives (Badge variants for verification, DisclaimerFooter, AppShell).
5. Auth + onboarding + org membership.
6. Opportunity Map with Leaflet + premises dossier + door-point editor RPC.
7. Acquisition Scout pipeline + CSV import.
8. Data & Sources screen.
9. Head metadata per route, sitemap.xml, robots.txt.
10. Manual verification pass against the 15 acceptance tests.

Confirm and I'll build.
