begin;

select plan(16);

select has_function(
  'public', 'candidate_nearest_pharmacy',
  array['double precision', 'double precision', 'boolean', 'integer'],
  'nearest-pharmacy function exists'
);
select has_function(
  'public', 'candidate_pharmacies_within_radius',
  array['double precision', 'double precision', 'integer'],
  'radius function exists'
);
select has_function(
  'public', 'candidate_external_within_500m',
  array['text', 'double precision', 'double precision'],
  'external 500m function exists'
);
select has_function(
  'public', 'candidate_site_analysis',
  array['double precision', 'double precision', 'integer'],
  'candidate analysis function exists'
);

select function_privs_are(
  'public', 'candidate_site_analysis',
  array['double precision', 'double precision', 'integer'],
  'anon', array['EXECUTE'],
  'anonymous users may execute only the bounded public analysis'
);

select table_privs_are(
  'public', 'external_raw_records', 'anon', array[]::text[],
  'anonymous users cannot read raw external records'
);

delete from public.pbs_approvals;
delete from public.pharmacy_premises;
delete from public.external_entity_conflicts;
delete from public.supermarkets;
delete from public.medical_centres;
delete from public.external_raw_records;
delete from public.external_import_runs;
delete from public.external_source_registry;
delete from public.source_records;

insert into public.source_records (
  id, source_name, source_kind, source_url, fetched_at, confidence
) values (
  '10000000-0000-4000-8000-000000000001',
  'Fixture pharmacy source', 'manual', 'https://example.test/pharmacy',
  now() - interval '2 years', 'fixture'
);

insert into public.pharmacy_premises (
  id, name, address, premises_source, source_confidence, source_id,
  geocode_method, vpa_registration_status, location
) values
  (
    '10000000-0000-4000-8000-000000000101',
    'Exact confirmed pharmacy', '1 Exact Street', 'manual', 'high',
    '10000000-0000-4000-8000-000000000001', 'exact', 'verified',
    ST_SetSRID(ST_MakePoint(144.96, -37.81), 4326)::geography
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    'Approximate pharmacy', '2 Duplicate Street', 'manual', 'approximate',
    '10000000-0000-4000-8000-000000000001', 'suburb_centroid', 'conflict',
    ST_SetSRID(ST_MakePoint(144.962, -37.81), 4326)::geography
  ),
  (
    '10000000-0000-4000-8000-000000000103',
    'Approximate pharmacy duplicate', '2 Duplicate Street', 'manual', 'approximate',
    '10000000-0000-4000-8000-000000000001', 'suburb_centroid', 'unverified',
    ST_SetSRID(ST_MakePoint(144.96201, -37.81), 4326)::geography
  );

insert into public.external_source_registry (
  id, source_key, name, dataset_url, licence_name, licence_url, terms_status,
  attribution_text, geographic_coverage
) values (
  '20000000-0000-4000-8000-000000000001',
  'fixture-osm', 'Fixture OSM', 'https://example.test/osm', 'ODbL 1.0',
  'https://www.openstreetmap.org/copyright', 'approved', '© OpenStreetMap contributors',
  'Fixture coverage'
);

insert into public.external_import_runs (
  id, source_id, category, status, fetched_count, imported_count
) values
  (
    '20000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000001', 'supermarkets', 'completed', 1, 1
  ),
  (
    '20000000-0000-4000-8000-000000000012',
    '20000000-0000-4000-8000-000000000001', 'medical_centres', 'completed', 1, 1
  );

insert into public.supermarkets (
  id, source_id, source_record_id, import_run_id, name, normalised_name,
  location, coordinate_method, coordinate_confidence, verification_status,
  licence_status, fetched_at
) values (
  '20000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000001', 'supermarket-1',
  '20000000-0000-4000-8000-000000000011', 'Boundary supermarket', 'boundary supermarket',
  ST_Project(ST_SetSRID(ST_MakePoint(144.96, -37.81), 4326)::geography, 500, radians(90)),
  'source_geometry_centroid', 0.6, 'unverified', 'approved', now() - interval '1 year'
);

insert into public.medical_centres (
  id, source_id, source_record_id, import_run_id, name, normalised_name,
  location, coordinate_method, coordinate_confidence, verification_status,
  licence_status, fetched_at
) values (
  '20000000-0000-4000-8000-000000000102',
  '20000000-0000-4000-8000-000000000001', 'medical-1',
  '20000000-0000-4000-8000-000000000012', 'Nearby medical centre', 'nearby medical centre',
  ST_Project(ST_SetSRID(ST_MakePoint(144.96, -37.81), 4326)::geography, 250, radians(180)),
  'source_point', 1.0, 'confirmed', 'approved', now()
);

select is(
  round((select calculated_point_distance_m
         from public.candidate_nearest_pharmacy(-37.81, 144.96, true, 1)))::integer,
  0,
  'exact coincident coordinates calculate zero metres'
);

select is(
  (select name from public.candidate_nearest_pharmacy(-37.81, 144.96, true, 1)),
  'Exact confirmed pharmacy',
  'confirmed nearest excludes unverified discovery records'
);

select ok(
  (select distance_usable = false
     from public.candidate_nearest_pharmacy(-37.81, 144.96199, false, 3)
     where id = '10000000-0000-4000-8000-000000000102'),
  'approximate or conflicting coordinates are not usable measurements'
);

select ok(
  (select unresolved_duplicate_candidates > 0
     from public.candidate_nearest_pharmacy(-37.81, 144.96199, false, 3)
     where id = '10000000-0000-4000-8000-000000000102'),
  'duplicate pharmacy candidates are surfaced'
);

select ok(
  (select warnings @> array['Source evidence is stale']
     from public.candidate_nearest_pharmacy(-37.81, 144.96, true, 1)),
  'stale pharmacy evidence is warned'
);

select is(
  (select count(*)::integer
     from public.candidate_external_within_500m('supermarkets', -37.81, 144.96)),
  1,
  '500 metre boundary is inclusive'
);

select is(
  jsonb_array_length(
    public.candidate_site_analysis(-37.81, 144.96, 100)
      -> 'pharmacies_within_radius'
  ),
  1,
  'configurable radius returns only nearby pharmacy records'
);

select is(
  jsonb_array_length(
    public.candidate_site_analysis(-34.1, 149.8, 100)
      -> 'pharmacies_within_radius'
  ),
  0,
  'no-nearby-record state returns an empty array rather than invented evidence'
);

select throws_ok(
  $$select public.candidate_site_analysis(-33.0, 151.0, 1500)$$,
  'Candidate location is outside Victorian operating bounds',
  'candidate locations outside Victoria are rejected'
);

select throws_ok(
  $$select * from public.candidate_pharmacies_within_radius(-37.81, 144.96, 99)$$,
  'Radius must be between 100 and 20000 metres',
  'invalid radius boundary is rejected'
);

select * from finish();
rollback;
