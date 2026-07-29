BEGIN;

SELECT plan(10);

SELECT has_function(
  'public', 'pharmacy_pipeline_status', ARRAY['uuid'],
  'pipeline status function exists'
);
SELECT has_function(
  'public', 'add_pharmacy_to_pipeline',
  ARRAY['uuid', 'pipeline_stage', 'text', 'text', 'numeric', 'date'],
  'pipeline add function exists'
);
SELECT function_privs_are(
  'public', 'pharmacy_pipeline_status', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anonymous users cannot read private pipeline state'
);
SELECT function_privs_are(
  'public', 'add_pharmacy_to_pipeline',
  ARRAY['uuid', 'pipeline_stage', 'text', 'text', 'numeric', 'date'],
  'anon', ARRAY[]::text[], 'anonymous users cannot create pipeline records'
);
SELECT function_privs_are(
  'public', 'pharmacy_pipeline_status', ARRAY['uuid'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated users may read scoped pipeline state'
);
SELECT function_privs_are(
  'public', 'add_pharmacy_to_pipeline',
  ARRAY['uuid', 'pipeline_stage', 'text', 'text', 'numeric', 'date'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated users may add scoped pipeline records'
);
SELECT has_index(
  'public', 'pharmacy_businesses', 'ux_pharmacy_businesses_org_premises',
  'an organisation cannot create duplicate pharmacy businesses'
);
SELECT col_is_null(
  'public', 'pharmacy_businesses', 'canonical_name_snapshot',
  'canonical snapshot remains nullable for preserved legacy records'
);
SELECT col_has_default(
  'public', 'pharmacy_businesses', 'listing_status',
  'new pipeline records receive an explicit listing status'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_businesses'::regclass
      AND pg_get_constraintdef(oid) LIKE '%withdrawn%'
      AND pg_get_constraintdef(oid) LIKE '%sold%'
  ),
  'listing status is constrained to the controlled vocabulary'
);

SELECT * FROM finish();
ROLLBACK;
