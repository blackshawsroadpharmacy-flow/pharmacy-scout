BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id, email) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'geocode-admin@example.test');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.pharmacy_vpa_runs (
  id, status, triggered_by, source_file_hash, source_row_count, premises_count
) VALUES (
  'f2000000-0000-4000-8000-000000000001', 'staged',
  'f1000000-0000-4000-8000-000000000001', repeat('f', 64), 1, 1
);
INSERT INTO public.pharmacy_vpa_staged_premises (
  id, run_id, source_record_key, source_row_fingerprint, official_name,
  street_address, suburb, postcode, full_address, registration_status_raw,
  registration_status_normalised, source_url, source_scraped_at, disposition,
  algorithm_version
) VALUES (
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'geo-key', repeat('e', 64),
  'Geocode Fixture', '1 Geo Street', 'Melbourne', '3000',
  '1 Geo Street, Melbourne VIC 3000', 'Active', 'active',
  'https://pharmacy.vic.gov.au/register-search/', now(),
  'unmatched_new_premises', 'vpa-match-v1.0.0'
);
INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source
) VALUES
  ('f4000000-0000-4000-8000-000000000001', 'Geo A', '1 Geo Street',
   'Melbourne', '3000',
   ST_SetSRID(ST_MakePoint(144.96, -37.81), 4326)::geography, 'vpa_register'),
  ('f4000000-0000-4000-8000-000000000002', 'Geo B', '2 Geo Street',
   'Melbourne', '3000',
   ST_SetSRID(ST_MakePoint(144.97, -37.82), 4326)::geography, 'vpa_register');

SELECT lives_ok(
  $$SELECT public.assert_vpa_validated_geocode(
    'f4000000-0000-4000-8000-000000000001')$$,
  'unresolved status does not require evidence'
);
UPDATE public.pharmacy_premises SET vpa_geocode_status = 'validated'
WHERE id = 'f4000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT public.assert_vpa_validated_geocode(
    'f4000000-0000-4000-8000-000000000001')$$,
  'Validated VPA geocode requires approved same-premises evidence within 25 metres',
  'validated status without evidence fails'
);

INSERT INTO public.pharmacy_vpa_geocode_results (
  id, run_id, staged_premises_id, premises_id, queried_address,
  normalised_address, provider, provider_result_id, latitude, longitude,
  validation_state, reviewer_status, reviewed_by
) VALUES (
  'f5000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000002',
  '1 Geo Street', '1 geo st melbourne 3000', 'fixture', 'wrong-premises',
  -37.81, 144.96, 'validated', 'approved',
  'f1000000-0000-4000-8000-000000000001'
);
SELECT throws_ok(
  $$SELECT public.assert_vpa_validated_geocode(
    'f4000000-0000-4000-8000-000000000001')$$,
  'Validated VPA geocode requires approved same-premises evidence within 25 metres',
  'evidence for another premises fails'
);
UPDATE public.pharmacy_vpa_geocode_results
SET premises_id = 'f4000000-0000-4000-8000-000000000001',
    validation_state = 'quarantined'
WHERE id = 'f5000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT public.assert_vpa_validated_geocode(
    'f4000000-0000-4000-8000-000000000001')$$,
  'Validated VPA geocode requires approved same-premises evidence within 25 metres',
  'rejected evidence fails'
);
UPDATE public.pharmacy_vpa_geocode_results
SET validation_state = 'validated', latitude = -37.70, longitude = 145.20
WHERE id = 'f5000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$SELECT public.assert_vpa_validated_geocode(
    'f4000000-0000-4000-8000-000000000001')$$,
  'Validated VPA geocode requires approved same-premises evidence within 25 metres',
  'mismatched coordinates fail'
);
UPDATE public.pharmacy_vpa_geocode_results
SET latitude = -37.81, longitude = 144.96
WHERE id = 'f5000000-0000-4000-8000-000000000001';
SELECT lives_ok(
  $$SELECT public.assert_vpa_validated_geocode(
    'f4000000-0000-4000-8000-000000000001')$$,
  'valid same-premises approved evidence succeeds'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_trigger
   WHERE tgname IN (
     'trg_assert_vpa_validated_geocode_on_premises',
     'trg_assert_vpa_validated_geocode_on_evidence'
   ) AND tgdeferrable),
  2,
  'database invariant is enforced by deferred constraint triggers'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$DELETE FROM public.pharmacy_vpa_geocode_results
    WHERE id = 'f5000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'normal authenticated deletion of evidence fails'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_vpa_geocode_results
   WHERE id = 'f5000000-0000-4000-8000-000000000001'),
  1,
  'append-only evidence remains retained'
);

SELECT * FROM finish();
ROLLBACK;
