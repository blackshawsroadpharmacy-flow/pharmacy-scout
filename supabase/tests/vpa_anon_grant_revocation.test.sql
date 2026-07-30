BEGIN;
SELECT plan(22);

-- ---------------------------------------------------------------------------
-- 1. anon holds no privilege of any kind on any private VPA table
-- ---------------------------------------------------------------------------
SELECT is_empty(
  $$
    SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'pharmacy_premises_licensees', 'pharmacy_vpa_runs',
        'pharmacy_vpa_staged_premises', 'pharmacy_vpa_staged_licensees',
        'pharmacy_vpa_match_candidates', 'pharmacy_vpa_review_queue',
        'pharmacy_vpa_quarantine', 'pharmacy_vpa_promotion_audit',
        'pharmacy_vpa_change_events', 'pharmacy_vpa_geocode_results',
        'pharmacy_vpa_raw_source_rows', 'vpa_published_licensees',
        'vpa_published_licensee_relationships', 'vpa_alert_watches',
        'vpa_private_alerts', 'vpa_gdp_staging_comparisons'
      )
      AND (
        has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE')
        OR has_table_privilege('anon', c.oid, 'TRUNCATE')
        OR has_table_privilege('anon', c.oid, 'REFERENCES')
        OR has_table_privilege('anon', c.oid, 'TRIGGER')
      )
  $$,
  'no private VPA table grants any privilege to anon'
);

-- 2. RLS remains enabled on every one of them (grants are not the only defence)
SELECT is_empty(
  $$
    SELECT c.relname::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE ANY (ARRAY['pharmacy_vpa_%', 'vpa_%', 'pharmacy_premises_licensees'])
      AND NOT c.relrowsecurity
  $$,
  'row level security stays enabled on every VPA table'
);

-- 3. no policy anywhere grants anon access to a VPA table
SELECT is_empty(
  $$
    SELECT policyname::text FROM pg_policies
    WHERE schemaname = 'public'
      AND (tablename LIKE 'pharmacy_vpa_%' OR tablename LIKE 'vpa_%'
           OR tablename = 'pharmacy_premises_licensees')
      AND 'anon' = ANY (roles)
  $$,
  'no VPA policy names anon as a grantee'
);

-- 4. Default privileges no longer hand anon future tables created by the
--    migration owner. Scoped to defaclrole = postgres deliberately: every VPA
--    table is owned by postgres, so that is the default ACL which governs tables
--    future migrations create. Supabase also maintains a separate platform-level
--    default ACL owned by supabase_admin which still grants anon; it applies only
--    to objects supabase_admin creates, postgres cannot alter it, and changing
--    platform defaults is out of scope for this migration.
SELECT is_empty(
  $$
    SELECT 'default_acl'::text
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
      AND pg_get_userbyid(d.defaclrole) = 'postgres'
      AND array_to_string(d.defaclacl, ',') LIKE '%anon=%'
  $$,
  'anon is not granted future postgres-owned tables in public by default'
);

-- 4b. Every private VPA table is in fact owned by postgres, so assertion 4 covers
--     the default ACL that actually governs them.
SELECT is_empty(
  $$
    SELECT tablename::text FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename LIKE 'pharmacy_vpa%' OR tablename LIKE 'vpa\_%'
           OR tablename = 'pharmacy_premises_licensees')
      AND tableowner <> 'postgres'
  $$,
  'all private VPA tables are owned by postgres'
);

-- ---------------------------------------------------------------------------
-- authenticated access that the signed-in application depends on is preserved
-- ---------------------------------------------------------------------------
SELECT ok(has_table_privilege('authenticated','public.pharmacy_premises_licensees','SELECT'),
  'authenticated retains licensee read access');
SELECT ok(has_table_privilege('authenticated','public.vpa_private_alerts','SELECT'),
  'authenticated retains alert read access');
SELECT ok(has_column_privilege('authenticated','public.vpa_private_alerts','read_at','UPDATE'),
  'authenticated can still acknowledge alerts via read_at');
SELECT ok(NOT has_table_privilege('authenticated','public.vpa_private_alerts','INSERT')
      AND NOT has_table_privilege('authenticated','public.vpa_private_alerts','DELETE'),
  'alert content remains non-writable by clients');
SELECT ok(has_table_privilege('authenticated','public.pharmacy_vpa_geocode_results','INSERT')
      AND NOT has_table_privilege('authenticated','public.pharmacy_vpa_geocode_results','DELETE'),
  'geocode evidence remains append-only for authenticated');
SELECT ok(has_table_privilege('service_role','public.pharmacy_premises_licensees','SELECT'),
  'service_role retains trusted access');

-- ---------------------------------------------------------------------------
-- fixtures
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('aa900000-0000-4000-8000-000000000001','anon-grant-admin@example.test'),
  ('aa900000-0000-4000-8000-000000000002','anon-grant-plain@example.test');
INSERT INTO public.user_roles (user_id, role)
  VALUES ('aa900000-0000-4000-8000-000000000001','admin');
INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source,
  vpa_registration_status_normalised
) VALUES (
  'aa000000-0000-4000-8000-000000000001','Anon Grant Fixture',
  '1 Anon Street','Melbourne','3000',
  ST_SetSRID(ST_MakePoint(144.9631,-37.8136),4326)::geography,
  'vpa_register','active'
);
INSERT INTO public.pharmacy_premises_licensees (
  id, premises_id, vpa_record_key, vpa_premises_name, licensee_name,
  last_seen_at, currently_observed
) VALUES (
  'aa100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',
  'anon-grant-fixture','Anon Grant Fixture','Example Licensee', now(), true
);

-- ---------------------------------------------------------------------------
-- anonymous behaviour
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;

-- 11. licensee data returns permission denied, not a false empty result
SELECT throws_ok(
  $$SELECT licensee_name FROM public.pharmacy_premises_licensees LIMIT 1$$,
  '42501', NULL,
  'anonymous licensee read is refused rather than returning an empty set'
);
-- 1/2. anon cannot read or write representative private VPA tables
SELECT throws_ok($$SELECT 1 FROM public.vpa_private_alerts LIMIT 1$$,
  '42501', NULL, 'anon cannot select organisation-private alerts');
SELECT throws_ok($$SELECT 1 FROM public.pharmacy_vpa_staged_premises LIMIT 1$$,
  '42501', NULL, 'anon cannot select staging rows');
SELECT throws_ok(
  $$INSERT INTO public.vpa_alert_watches (organisation_id, premises_id, created_by)
    VALUES ('aa000000-0000-4000-8000-000000000001',
            'aa000000-0000-4000-8000-000000000001',
            'aa900000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'anon cannot insert a watch');
SELECT throws_ok(
  $$DELETE FROM public.pharmacy_vpa_change_events$$,
  '42501', NULL, 'anon cannot delete change events');

-- 8/9/10. public map, search and dossier still work anonymously
SELECT ok(
  (SELECT count(*) FROM public.pharmacy_points_in_viewport(
     144.8,-38.0,145.1,-37.7,false,false,100)) >= 1,
  'anonymous public map viewport still returns pharmacies');
SELECT ok(
  (SELECT count(*) FROM public.public_pharmacy_dossier(
     'aa000000-0000-4000-8000-000000000001')) = 1,
  'anonymous public dossier still returns one row');
SELECT lives_ok(
  $$SELECT * FROM public.statewide_location_search('Anon Grant', 5)$$,
  'anonymous public search still executes');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 12. no public function leaks raw VPA tables; 4. non-admins cannot write them
-- ---------------------------------------------------------------------------
SELECT is_empty(
  $$
    SELECT p.proname::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.prosrc ~* '(pharmacy_vpa_staged|pharmacy_vpa_review_queue|pharmacy_vpa_quarantine|vpa_private_alerts|vpa_alert_watches|vpa_gdp_staging_comparisons|pharmacy_vpa_raw_source_rows)'
  $$,
  'no anon-executable definer function reads a private VPA table'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aa900000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_vpa_staged_premises),
  0, 'non-admin authenticated user sees no administrator-controlled staging rows');
RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_premises_licensees
   WHERE id = 'aa100000-0000-4000-8000-000000000001'),
  1, 'the licensee row remains readable to trusted roles');

SELECT * FROM finish();
ROLLBACK;
