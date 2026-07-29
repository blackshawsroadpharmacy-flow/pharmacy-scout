BEGIN;
SELECT plan(26);

SELECT has_table('public', 'pharmacy_vpa_staged_premises', 'run-scoped premises staging exists');
SELECT has_table('public', 'pharmacy_vpa_staged_licensees', 'run-scoped licensee staging exists');
SELECT has_table('public', 'pharmacy_vpa_match_candidates', 'ranked match candidates exist');
SELECT has_table('public', 'pharmacy_vpa_review_queue', 'ambiguous matches have a review queue');
SELECT has_table('public', 'pharmacy_vpa_quarantine', 'invalid source rows can be quarantined');
SELECT has_table('public', 'pharmacy_vpa_promotion_audit', 'promotions have immutable audit summaries');
SELECT has_table('public', 'pharmacy_vpa_change_events', 'field-level change-event foundation exists');
SELECT has_function('public', 'promote_vpa_import_run', ARRAY['uuid'], 'atomic promotion RPC exists');

SELECT function_privs_are(
  'public', 'promote_vpa_import_run', ARRAY['uuid'], 'authenticated',
  ARRAY['EXECUTE'], 'authenticated users may invoke the RPC; the function enforces admin'
);
SELECT function_privs_are(
  'public', 'promote_vpa_import_run', ARRAY['uuid'], 'anon',
  ARRAY[]::text[], 'anonymous callers cannot invoke promotion'
);

SELECT policies_are(
  'public', 'pharmacy_vpa_staged_premises',
  ARRAY['pharmacy_vpa_staged_premises_admin'],
  'staged premises are admin-only'
);
SELECT policies_are(
  'public', 'pharmacy_vpa_review_queue',
  ARRAY['pharmacy_vpa_review_queue_admin'],
  'matching review is admin-only'
);

SELECT throws_ok(
  $$SELECT public.promote_vpa_import_run(extensions.gen_random_uuid())$$,
  '42501',
  'Administrator role required',
  'promotion rejects anonymous callers'
);

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000201', 'role', 'authenticated')::text,
  true
);
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000201', 'vpa-admin@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000201', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.pharmacy_vpa_runs (
  id, status, triggered_by, source_file_name, source_file_hash,
  source_reference_date, source_scraped_at, source_row_count,
  premises_count, licensee_count
) VALUES (
  '00000000-0000-0000-0000-000000000301', 'staged',
  '00000000-0000-0000-0000-000000000201', 'fixture.csv', repeat('a', 64),
  '2026-07-29', '2026-07-29T13:34:38Z', 1, 1, 0
);

SELECT throws_ok(
  $$SELECT public.promote_vpa_import_run('00000000-0000-0000-0000-000000000301')$$,
  'VPA import run must be validated before promotion',
  'non-validated runs cannot promote'
);

UPDATE public.pharmacy_vpa_runs SET status = 'validated'
WHERE id = '00000000-0000-0000-0000-000000000301';
INSERT INTO public.pharmacy_vpa_staged_premises (
  id, run_id, source_record_key, source_row_fingerprint, official_name,
  street_address, suburb, postcode, full_address, registration_status_raw,
  registration_status_normalised, source_url, source_scraped_at, disposition,
  algorithm_version, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000301', 'fixture-key', repeat('b', 64),
  'Fixture Pharmacy', '1 Test Street', 'Melbourne', '3000',
  '1 Test Street, Melbourne VIC 3000', 'Active', 'active',
  'https://pharmacy.vic.gov.au/register-search/', '2026-07-29T13:34:38Z',
  'ambiguous_match', 'vpa-match-v1.0.0', 'review_required'
);

SELECT throws_ok(
  $$SELECT public.promote_vpa_import_run('00000000-0000-0000-0000-000000000301')$$,
  'VPA import run has 1 unresolved blocking records',
  'ambiguous matches fail closed'
);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_premises WHERE vpa_record_key = 'fixture-key'),
  0,
  'failed promotion leaves canonical premises unchanged'
);
SELECT is(
  (SELECT fetched_at FROM public.source_records WHERE source_key = 'vpa_public_register'),
  NULL::timestamptz,
  'failed promotion leaves source freshness unchanged'
);

UPDATE public.pharmacy_vpa_staged_premises
SET disposition = 'unmatched_new_premises',
    review_status = 'approved',
    promotion_approved = true,
    geocode_state = 'validated',
    proposed_lat = -37.8136,
    proposed_lng = 144.9631
WHERE id = '00000000-0000-0000-0000-000000000401';

SELECT lives_ok(
  $$SELECT public.promote_vpa_import_run('00000000-0000-0000-0000-000000000301')$$,
  'reviewed and geocoded new premises promotes atomically'
);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_premises WHERE vpa_record_key = 'fixture-key'),
  1,
  'one canonical pharmacy is created'
);
SELECT is(
  (SELECT status FROM public.pharmacy_vpa_runs
   WHERE id = '00000000-0000-0000-0000-000000000301'),
  'promoted',
  'successful promotion records the terminal state'
);

INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source,
  source_confidence, phone, website, notes
) VALUES (
  '00000000-0000-0000-0000-000000000501', 'Existing Trading Name',
  '2 Existing Road', 'Melbourne', '3000',
  ST_SetSRID(ST_MakePoint(144.95, -37.81), 4326)::geography,
  'manual', 'verified', '0399999999', 'https://example.test', 'private legacy note'
);
INSERT INTO public.pharmacy_vpa_runs (
  id, status, triggered_by, source_file_name, source_file_hash,
  source_reference_date, source_scraped_at, source_row_count,
  premises_count, licensee_count
) VALUES (
  '00000000-0000-0000-0000-000000000302', 'validated',
  '00000000-0000-0000-0000-000000000201', 'fixture-2.csv', repeat('c', 64),
  '2026-07-30', '2026-07-30T01:00:00Z', 2, 1, 2
);
INSERT INTO public.pharmacy_vpa_staged_premises (
  id, run_id, source_record_key, source_row_fingerprint, official_name,
  street_address, suburb, postcode, full_address, registration_status_raw,
  registration_status_normalised, source_url, source_scraped_at, disposition,
  proposed_canonical_premises_id, match_score, algorithm_version, review_status
) VALUES (
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000302', 'fixture-existing', repeat('d', 64),
  'Official VPA Name', '2 Existing Road', 'Melbourne', '3000',
  '2 Existing Road, Melbourne VIC 3000', 'Active', 'active',
  'https://pharmacy.vic.gov.au/register-search/', '2026-07-30T01:00:00Z',
  'exact_match', '00000000-0000-0000-0000-000000000501', 1,
  'vpa-match-v1.0.0', 'auto_accepted'
);
INSERT INTO public.pharmacy_vpa_staged_licensees (
  run_id, staged_premises_id, source_row_fingerprint, published_name
) VALUES
  ('00000000-0000-0000-0000-000000000302',
   '00000000-0000-0000-0000-000000000402', repeat('e', 64), 'Licensee One'),
  ('00000000-0000-0000-0000-000000000302',
   '00000000-0000-0000-0000-000000000402', repeat('f', 64), 'Licensee Two');

SELECT lives_ok(
  $$SELECT public.promote_vpa_import_run('00000000-0000-0000-0000-000000000302')$$,
  'an exact match with multiple licensees promotes atomically'
);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_premises WHERE id =
    '00000000-0000-0000-0000-000000000501'),
  1,
  'multiple licensees do not duplicate the pharmacy'
);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_premises_licensees WHERE premises_id =
    '00000000-0000-0000-0000-000000000501'),
  2,
  'both registered licensee relationships are retained'
);
SELECT results_eq(
  $$SELECT name, address, phone, website, notes FROM public.pharmacy_premises
    WHERE id = '00000000-0000-0000-0000-000000000501'$$,
  $$VALUES ('Existing Trading Name'::text, '2 Existing Road'::text,
    '0399999999'::text, 'https://example.test'::text, 'private legacy note'::text)$$,
  'promotion preserves canonical identity, phone, website, and notes'
);
SELECT is(
  (SELECT vpa_official_name FROM public.pharmacy_premises WHERE id =
    '00000000-0000-0000-0000-000000000501'),
  'Official VPA Name',
  'official VPA name is stored separately'
);
SELECT is(
  (SELECT ST_AsText(location::geometry) FROM public.pharmacy_premises WHERE id =
    '00000000-0000-0000-0000-000000000501'),
  'POINT(144.95 -37.81)',
  'existing coordinate is preserved'
);

SELECT * FROM finish();
ROLLBACK;
