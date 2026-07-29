BEGIN;
SELECT plan(12);
SELECT has_table('public','demographic_area_profiles','official demographic profiles exist');
SELECT has_table('public','pharmacy_demographic_context','pharmacy demographic cache exists');
SELECT is((SELECT count(*) FROM public.demographic_area_profiles),522::bigint,'all seeded Victorian SA2 profiles imported');
SELECT is(
  (SELECT count(*) FROM public.dispensing_demographic_sources
    WHERE reference_year=2021 AND licence='Creative Commons Attribution 4.0 International'),
  2::bigint,'both official sources preserve licence and reference year'
);
SELECT is(
  (SELECT count(*) FROM public.demographic_area_profiles
    WHERE census_total_population IS NULL AND census_total_population=0),
  0::bigint,'missing population is never represented as zero'
);
SELECT is(
  (SELECT count(*) FROM public.pharmacy_demographic_context),
  (SELECT count(*) FROM public.pharmacy_premises WHERE lat IS NOT NULL AND lng IS NOT NULL),
  'every mapped pharmacy has an explicit matched or unavailable context'
);
SELECT ok(
  (SELECT count(*) FROM public.pharmacy_dispensing_potential
    WHERE raw_metrics ? 'official_demographic_context') > 0,
  'GDP raw evidence includes official demographic context'
);
SELECT function_privs_are(
  'public','refresh_pharmacy_demographic_context',ARRAY[]::text[],'anon',ARRAY[]::text[],
  'anonymous users cannot refresh statewide spatial caches'
);
SELECT ok(
  has_function_privilege('anon',
    'public.demographic_areas_in_viewport(double precision,double precision,double precision,double precision,text)',
    'EXECUTE'),
  'anonymous map users can request the bounded public viewport layer'
);
SELECT ok(
  (SELECT count(*) FROM public.demographic_areas_in_viewport(140,-40,150,-34,'age65')) <= 600,
  'viewport function is server-bounded'
);
SELECT is(
  (public.demographic_context_at_point(-37.8136,144.9631)->>'assignment_method'),
  'point-in-polygon','candidate assignment method is explicit'
);
SELECT ok(
  public.public_data_freshness() ? 'abs_demographic_retrieved_at',
  'public freshness report includes demographic retrieval metadata'
);
SELECT * FROM finish();
ROLLBACK;
