BEGIN;
SELECT plan(21);

SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_premises', 'SELECT'),
  'anonymous direct pharmacy_premises SELECT is revoked'
);
SELECT ok(
  NOT has_column_privilege('anon', 'public.pharmacy_premises', 'notes', 'SELECT')
  AND NOT has_column_privilege(
    'anon', 'public.pharmacy_premises', 'vpa_match_confidence', 'SELECT'
  ),
  'anonymous callers cannot read internal base-table columns'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_premises_geo', 'SELECT')
  AND NOT has_table_privilege(
    'anon', 'public.pharmacy_premises_vpa_lifecycle', 'SELECT'
  ),
  'legacy geographic and lifecycle projections do not bypass the revoke'
);
SELECT ok(
  has_table_privilege(
    'authenticated', 'public.pharmacy_premises_vpa_lifecycle', 'SELECT'
  ),
  'the narrow lifecycle projection is deliberately authenticated'
);
SELECT function_privs_are(
  'public', 'public_pharmacy_dossier', ARRAY['uuid'],
  'anon', ARRAY['EXECUTE'], 'anonymous callers may execute one-record dossier'
);
SELECT function_privs_are(
  'public', 'pharmacy_points_in_viewport',
  ARRAY[
    'double precision', 'double precision', 'double precision',
    'double precision', 'boolean', 'boolean', 'integer'
  ],
  'anon', ARRAY['EXECUTE'], 'anonymous callers may execute bounded viewport'
);

UPDATE public.pharmacy_premises SET location = NULL;

INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source,
  source_confidence, geocode_method, notes,
  vpa_registration_status_normalised, vpa_official_name,
  vpa_pbs_match_state, vpa_match_confidence, vpa_review_status
)
SELECT
  md5('public-baseline-' || n::text)::uuid,
  'Baseline Pharmacy ' || n,
  n || ' Public Street',
  'Melbourne',
  '3000',
  ST_SetSRID(
    ST_MakePoint(144.90 + (n % 50) / 1000.0, -37.85 + (n % 40) / 1000.0),
    4326
  )::geography,
  'vpa_register',
  CASE WHEN n = 1 THEN 'provider_exact' ELSE NULL END,
  CASE WHEN n = 2 THEN 'suburb_centroid' ELSE NULL END,
  'private note ' || n,
  'active',
  CASE WHEN n = 1 THEN 'Official Baseline Pharmacy' ELSE NULL END,
  CASE WHEN n = 1 THEN 'vpa_and_pbs_matched' ELSE 'unresolved' END,
  0.99,
  'approved'
FROM generate_series(1, 922) AS n;

INSERT INTO public.pbs_approvals (
  approval_number, approval_status, premises_id, notes
) VALUES (
  'PUBLIC-1', 'verified', md5('public-baseline-1')::uuid,
  'private PBS note'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.pharmacy_premises LIMIT 1$$,
  '42501', NULL, 'anonymous base-table enumeration is rejected'
);
SELECT throws_ok(
  $$SELECT notes FROM public.pharmacy_premises LIMIT 1$$,
  '42501', NULL, 'anonymous internal-column access is rejected'
);
SELECT is(
  (
    SELECT max(total_count)::integer
    FROM public.pharmacy_points_in_viewport(
      144.8, -38.0, 145.1, -37.7, false, false, 2000
    )
  ),
  922,
  'public map returns the existing 922-pharmacy pre-promotion baseline'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.pharmacy_points_in_viewport(
      144.8, -38.0, 145.1, -37.7, false, false, 2000
    )
  ),
  922,
  'public viewport succeeds at its documented safe maximum'
);
SELECT throws_ok(
  $$SELECT * FROM public.pharmacy_points_in_viewport(
      130, -50, 160, -20, false, false, 2000
    )$$,
  'Invalid Victorian viewport',
  'viewport bounds outside Victoria are rejected'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.statewide_location_search('Baseline Pharmacy 1', 24)
    WHERE result_type = 'pharmacy'
      AND result_id = md5('public-baseline-1')::uuid
  ),
  'anonymous public pharmacy search succeeds'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.statewide_location_search('Baseline', 999999)
  ),
  30,
  'public search cannot bypass its maximum result limit'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.public_pharmacy_dossier(md5('public-baseline-1')::uuid)
  ),
  1,
  'anonymous public dossier succeeds'
);
SELECT is(
  (
    SELECT pbs_approvals
    FROM public.public_pharmacy_dossier(md5('public-baseline-1')::uuid)
  ),
  '[{"approval_number": "PUBLIC-1", "approval_status": "verified"}]'::jsonb,
  'public dossier returns only approved PBS fields'
);
SELECT is(
  (
    SELECT source_confidence
    FROM public.public_pharmacy_dossier(md5('public-baseline-1')::uuid)
  ),
  'verified',
  'raw internal source confidence is reduced to a public-safe value'
);
SELECT ok(
  (
    SELECT row_to_json(dossier)::jsonb
      ?& ARRAY[
        'id', 'name', 'address', 'lat', 'lng', 'vpa_official_name',
        'vpa_registration_status_normalised', 'vpa_pbs_match_state'
      ]
      AND NOT row_to_json(dossier)::jsonb
        ?| ARRAY[
          'notes', 'source_id', 'vpa_source_id', 'vpa_match_confidence',
          'vpa_match_method', 'vpa_review_status', 'vpa_geocode_status',
          'vpa_last_successful_run_id', 'vpa_source_row_fingerprint'
        ]
    FROM public.public_pharmacy_dossier(md5('public-baseline-1')::uuid) AS dossier
  ),
  'public dossier shape contains approved fields and excludes internal fields'
);
RESET ROLE;

UPDATE public.pharmacy_premises
SET vpa_registration_status_normalised = 'closed'
WHERE id = md5('public-baseline-1')::uuid;
SET LOCAL ROLE anon;
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.pharmacy_points_in_viewport(
      144.8, -38.0, 145.1, -37.7, false, false, 2000
    )
    WHERE id = md5('public-baseline-1')::uuid
  ),
  0,
  'closed and historical premises are excluded from the default public map'
);
RESET ROLE;

SELECT ok(
  has_table_privilege('authenticated', 'public.pharmacy_premises', 'SELECT'),
  'authenticated users retain intended canonical read access'
);
SELECT ok(
  has_table_privilege('service_role', 'public.pharmacy_premises', 'SELECT')
  AND has_table_privilege('service_role', 'public.pharmacy_premises', 'UPDATE'),
  'trusted administrator service access remains available'
);
SELECT is_empty(
  $$
    SELECT pg_proc.proname
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.prosecdef
      AND pg_proc.proname IN (
        'public_pharmacy_dossier',
        'pharmacy_points_in_viewport',
        'statewide_location_search'
      )
      AND NOT (
        pg_proc.proconfig @> ARRAY[
          'search_path=public, extensions, pg_temp'
        ]
      )
  $$,
  'public SECURITY DEFINER reads use the fixed approved search path'
);

SELECT * FROM finish();
ROLLBACK;
