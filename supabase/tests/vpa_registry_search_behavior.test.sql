BEGIN;
SELECT plan(12);

INSERT INTO auth.users (id, email) VALUES
  ('b7000000-0000-4000-8000-000000000001', 'registry-user@example.test');
INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source,
  vpa_record_key, vpa_official_name, vpa_official_full_address,
  vpa_source_verification_status
) VALUES (
  'b7100000-0000-4000-8000-000000000001', 'Trading Name',
  '10 Registry Road', 'Melbourne', '3000',
  ST_SetSRID(ST_MakePoint(144.96, -37.81), 4326)::geography,
  'vpa_register', 'registry-key', 'Official Registry Pharmacy',
  '10 Registry Road, Melbourne VIC 3000', 'authoritative_source'
);
INSERT INTO public.pharmacy_premises_licensees (
  id, premises_id, vpa_record_key, vpa_premises_name, licensee_name,
  first_observed_at, last_seen_at, currently_observed
) VALUES (
  'b7200000-0000-4000-8000-000000000001',
  'b7100000-0000-4000-8000-000000000001',
  'registry-person-fixture', 'Official Registry Pharmacy', 'Registry Person',
  '2026-07-01', '2026-07-30', true
);

SELECT function_privs_are(
  'public', 'vpa_registry_search', ARRAY['text', 'integer', 'integer'],
  'anon', ARRAY[]::text[], 'anonymous execution is rejected'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  'Official Registry', 0, 24)), 1, 'official premises name search executes');
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  'Registry Road', 0, 24)), 1, 'official address search executes');
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  'Registry Person', 0, 24)), 1, 'published licensee-name search executes');
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  'x', 0, 24)), 0, 'short query is rejected');
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  E'Registry\nPerson', 0, 24)), 0, 'control-character query is rejected');
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  'Registry', 0, 500)), 1, 'result limit is bounded to the available row');
SELECT lives_ok(
  $$SELECT * FROM public.vpa_registry_search('Registry', 500000, 24)$$,
  'offset is safely bounded'
);
SELECT is((SELECT count(*)::integer FROM public.vpa_registry_search(
  'Registry', 0, 24)), 1, 'one canonical premises is returned once');
SELECT is((SELECT result_type FROM public.vpa_registry_search(
  'Registry', 0, 24) LIMIT 1), 'vpa_pharmacy', 'result shape identifies VPA pharmacy');
SELECT is((SELECT registration_source_status FROM public.vpa_registry_search(
  'Registry', 0, 24) LIMIT 1), 'authoritative_source',
  'result shape uses accurate registration source vocabulary');
SELECT ok((SELECT lat IS NOT NULL AND lng IS NOT NULL
  FROM public.vpa_registry_search('Registry', 0, 24) LIMIT 1),
  'result shape includes validated finite navigation coordinates when present');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
