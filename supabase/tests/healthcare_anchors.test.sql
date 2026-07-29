BEGIN;
SELECT plan(10);
SELECT has_table('public','healthcare_anchor_raw','raw healthcare source table exists');
SELECT has_table('public','healthcare_anchors','canonical healthcare anchor table exists');
SELECT is(
  (SELECT count(*) FROM public.healthcare_anchors WHERE category='residential_aged_care'),
  745::bigint,'745 official Victorian residential aged-care anchors imported'
);
SELECT is(
  (SELECT count(*) FROM public.healthcare_anchors WHERE approved_places IS NULL),
  0::bigint,'published residential places are retained for imported residential services'
);
SELECT is(
  (SELECT count(*) FROM public.healthcare_anchors WHERE authoritative_identifier IS NOT NULL),
  0::bigint,'an identifier absent from the official publication is not fabricated'
);
SELECT ok(
  (SELECT count(*) FROM public.healthcare_anchor_raw) =
  (SELECT count(*) FROM public.healthcare_anchors),
  'every canonical anchor retains its raw source record'
);
SELECT ok(
  (SELECT count(*) FROM public.healthcare_anchors_in_viewport(140,-40,150,-33,NULL)) <= 750,
  'viewport result is bounded'
);
SELECT is(
  (public.healthcare_demand_at_point(-37.8136,144.9631)->>'hospitals_5km'),
  NULL,'unavailable hospital coverage is not returned as zero'
);
SELECT ok(
  (SELECT count(*) FROM public.pharmacy_dispensing_potential
    WHERE raw_metrics ? 'official_healthcare_anchor_context') > 0,
  'GDP raw evidence includes healthcare context'
);
SELECT function_privs_are(
  'public','healthcare_demand_at_point',ARRAY['double precision','double precision'],
  'anon',ARRAY['EXECUTE'],'public demand evidence is available without private data'
);
SELECT * FROM finish();
ROLLBACK;
