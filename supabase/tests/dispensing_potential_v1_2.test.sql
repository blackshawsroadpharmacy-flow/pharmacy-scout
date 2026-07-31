BEGIN;
SELECT plan(7);

-- catchment_population is non-negative and returns a real apportioned
-- population for a populated Melbourne CBD point (exercises the index path).
SELECT ok(
  (SELECT public.catchment_population(
     ST_SetSRID(ST_MakePoint(144.9631,-37.8136),4326)::geography, 2000) > 0),
  'catchment_population returns a positive apportioned population for Melbourne CBD'
);

-- A point far offshore (central Bass Strait) has no intersecting SA2 within
-- 2 km, so the apportioned population must be zero, not null.
SELECT is(
  (SELECT public.catchment_population(
     ST_SetSRID(ST_MakePoint(145.0,-39.5),4326)::geography, 2000)),
  0::numeric,
  'catchment_population returns 0 where no SA2 intersects the buffer'
);

-- v1.2 method exists and is inactive by design (activation is a separate
-- reviewable decision).
SELECT is(
  (SELECT count(*) FROM public.dispensing_potential_methods WHERE version='gdp-v1.2.0'),
  1::bigint,'v1.2 method exists'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_potential_methods WHERE version='gdp-v1.2.0' AND active),
  0::bigint,'v1.2 method is not auto-activated'
);

-- The refresh must cover every premises that has a location (no premises_source
-- filter) and complete within the local statement_timeout.
SELECT is(
  (SELECT public.refresh_dispensing_potential_v1_2()),
  (SELECT count(*) FROM public.pharmacy_premises WHERE location IS NOT NULL)::int,
  'v1.2 refresh covers every premises with a location'
);
SELECT is(
  (SELECT count(*) FROM public.pharmacy_dispensing_potential p
   JOIN public.dispensing_potential_methods m ON m.id=p.method_id
   JOIN public.pharmacy_premises pp ON pp.id=p.pharmacy_id
   WHERE m.version='gdp-v1.2.0' AND pp.location IS NOT NULL),
  (SELECT count(*) FROM public.pharmacy_premises WHERE location IS NOT NULL)::bigint,
  'a v1.2 row exists for every premises with a location'
);

-- F-23e: no stale peer_percentile lingers on rows that lost their peer group.
SELECT is(
  (SELECT count(*) FROM public.pharmacy_dispensing_potential
   WHERE peer_group IS NULL AND peer_percentile IS NOT NULL),
  0::bigint,
  'no stale peer percentile remains where peer group is null'
);

SELECT * FROM finish();
ROLLBACK;
