BEGIN;
SELECT plan(12);

SELECT has_function('public', 'statewide_location_search', ARRAY['text', 'integer']);
SELECT function_privs_are(
  'public', 'statewide_location_search', ARRAY['text', 'integer'],
  'anon', ARRAY['EXECUTE'], 'anonymous callers may execute bounded public search'
);
SELECT function_privs_are(
  'public', 'statewide_location_search', ARRAY['text', 'integer'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated callers may execute search'
);
SELECT has_index('public', 'pharmacy_premises', 'ix_pharmacy_premises_search_name_trgm');
SELECT has_index('public', 'supermarkets', 'ix_supermarkets_search_name_trgm');
SELECT has_index('public', 'medical_centres', 'ix_medical_centres_search_name_trgm');

SET LOCAL ROLE anon;
SELECT ok(
  (SELECT count(*) <= 30 FROM public.statewide_location_search('pharmacy', 999)),
  'server enforces the absolute result limit'
);
SELECT is(
  (SELECT count(*) FROM public.statewide_location_search('x', 24)),
  0::bigint, 'single-character input is rejected'
);
SELECT is(
  (SELECT count(*) FROM public.statewide_location_search(repeat('x', 121), 24)),
  0::bigint, 'oversized input is rejected'
);
SELECT is(
  (SELECT count(*) FROM public.statewide_location_search(E'test\nquery', 24)),
  0::bigint, 'control-character input is rejected'
);
SELECT is(
  (
    SELECT count(*) FROM public.statewide_location_search('pharmacy', 30)
    WHERE is_private OR result_type IN ('acquisition_opportunity', 'candidate_site')
  ),
  0::bigint, 'anonymous search never returns private categories'
);

RESET ROLE;
SELECT has_function('public', 'public_data_freshness', ARRAY[]::text[]);
SELECT * FROM finish();
ROLLBACK;
