BEGIN;
SELECT plan(10);

SELECT has_table('public', 'vpa_published_licensees');
SELECT has_table('public', 'vpa_published_licensee_relationships');
SELECT has_view('public', 'vpa_published_licensee_networks');
SELECT has_function('public', 'vpa_registry_search', ARRAY['text', 'integer', 'integer']);
SELECT function_privs_are(
  'public', 'vpa_registry_search', ARRAY['text', 'integer', 'integer'],
  'anon', ARRAY[]::text[], 'anonymous users cannot enumerate registered licensees'
);
SELECT function_privs_are(
  'public', 'vpa_registry_search', ARRAY['text', 'integer', 'integer'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated users can use bounded registry search'
);
SELECT policies_are(
  'public', 'vpa_published_licensees',
  ARRAY['vpa_published_licensees_read'],
  'published licensee entities are read-only to authenticated users'
);
SELECT is(
  public.normalise_vpa_published_name('  Example & Co. Pty Ltd  '),
  'example co pty ltd',
  'published-name comparison is deterministic without inferring corporate relationships'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_published_licensees),
  0,
  'migration fabricates no licensee entities'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_published_licensee_relationships),
  0,
  'migration fabricates no licensee relationships'
);

SELECT * FROM finish();
ROLLBACK;
