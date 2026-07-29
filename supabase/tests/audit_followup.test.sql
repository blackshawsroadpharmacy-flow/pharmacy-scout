BEGIN;
SELECT plan(9);

SELECT has_function(
  'public',
  'statewide_location_search',
  ARRAY['text', 'integer'],
  'parameterised statewide search remains available'
);
SELECT has_function(
  'public',
  'create_acquisition_business',
  ARRAY['text', 'text', 'numeric', 'text', 'text', 'pipeline_stage'],
  'atomic acquisition creator exists'
);
SELECT function_privs_are(
  'public',
  'create_acquisition_business',
  ARRAY['text', 'text', 'numeric', 'text', 'text', 'pipeline_stage'],
  'anon',
  ARRAY[]::text[],
  'anonymous callers cannot create private acquisitions'
);
SELECT function_privs_are(
  'public',
  'create_acquisition_business',
  ARRAY['text', 'text', 'numeric', 'text', 'text', 'pipeline_stage'],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated callers may invoke the transactional creator'
);
SELECT ok(
  to_regclass('public.ix_healthcare_anchors_search_name_trgm') IS NOT NULL,
  'aged-care name trigram index exists'
);
SELECT ok(
  to_regclass('public.ix_healthcare_anchors_search_address_trgm') IS NOT NULL,
  'aged-care address trigram index exists'
);
SELECT ok(
  to_regclass('public.ix_healthcare_anchors_search_suburb_trgm') IS NOT NULL,
  'aged-care suburb trigram index exists'
);
SELECT lives_ok(
  $$SELECT * FROM public.statewide_location_search('x),id.eq.anything', 24)$$,
  'filter-like user input remains data and cannot alter the query'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.statewide_location_search('aged care', 30)
    WHERE result_type = 'aged_care'
  ),
  'official aged-care anchors are returned by the RPC'
);

SELECT * FROM finish();
ROLLBACK;
