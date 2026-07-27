begin;

select plan(7);

select has_function(
  'public',
  'pharmacy_points_in_viewport',
  array['double precision', 'double precision', 'double precision', 'double precision', 'boolean', 'boolean', 'integer'],
  'pharmacy viewport RPC exists'
);

select function_privs_are(
  'public',
  'pharmacy_points_in_viewport',
  array['double precision', 'double precision', 'double precision', 'double precision', 'boolean', 'boolean', 'integer'],
  'anon',
  array['EXECUTE'],
  'anon may execute the pharmacy viewport RPC'
);

insert into public.pharmacy_premises (
  id, name, address, postcode, premises_source, phone, website, source_confidence,
  geocode_method, location
) values
  (
    '00000000-0000-4000-8000-000000000101', 'Viewport inside complete', '1 Test Street',
    '3000', 'manual', '0300000000', 'https://example.test', 'high', 'exact',
    ST_SetSRID(ST_MakePoint(144.96, -37.81), 4326)::geography
  ),
  (
    '00000000-0000-4000-8000-000000000102', 'Viewport inside missing', '2 Test Street',
    '3000', 'manual', '0300000000', NULL, 'approximate', 'suburb_centroid',
    ST_SetSRID(ST_MakePoint(144.97, -37.82), 4326)::geography
  ),
  (
    '00000000-0000-4000-8000-000000000103', 'Viewport outside', '3 Test Street',
    '3220', 'manual', '0300000000', 'https://example.test', 'high', 'exact',
    ST_SetSRID(ST_MakePoint(144.36, -38.15), 4326)::geography
  );

select results_eq(
  $$
    select id
    from public.pharmacy_points_in_viewport(144.9, -37.9, 145.1, -37.7, false, false, 2000)
    where id::text like '00000000-0000-4000-8000-00000000010%'
    order by id
  $$,
  $$
    values
      ('00000000-0000-4000-8000-000000000101'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid)
  $$,
  'viewport query includes only points inside bounds'
);

select results_eq(
  $$
    select id
    from public.pharmacy_points_in_viewport(144.9, -37.9, 145.1, -37.7, true, false, 2000)
    where id::text like '00000000-0000-4000-8000-00000000010%'
  $$,
  $$values ('00000000-0000-4000-8000-000000000102'::uuid)$$,
  'missing-data filter is applied by the database'
);

select throws_ok(
  $$select * from public.pharmacy_points_in_viewport(145.1, -37.7, 144.9, -37.9, false, false, 2000)$$,
  'Invalid Victorian viewport',
  'inverted bounds are rejected'
);

select throws_ok(
  $$select * from public.pharmacy_points_in_viewport(144.9, -37.9, 145.1, -37.7, false, false, 2001)$$,
  'Invalid limit',
  'oversized requests are rejected'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'pharmacy_premises'
      and indexname = 'ix_pharmacy_premises_location'
  ),
  'pharmacy viewport predicate is backed by the GiST location index'
);

select * from finish();
rollback;
