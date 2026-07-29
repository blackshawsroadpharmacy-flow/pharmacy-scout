BEGIN;
SELECT plan(20);

SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_record_key',
  'pharmacy premises has a stable VPA record key'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'published_licensee_names',
  'VPA-published names use neutral registered-licensee terminology'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_registration_status_raw',
  'raw VPA registration status is preserved'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_registration_status_normalised',
  'normalised VPA registration status is stored separately'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_registered_until',
  'published registration date is preserved'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_premises_conditions_raw',
  'raw premises conditions are preserved'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_currently_observed',
  'source observation state is separate from registration status'
);
SELECT has_column(
  'public',
  'pharmacy_premises_licensees',
  'currently_observed',
  'licensee observation state is reversible'
);
SELECT has_column(
  'public',
  'pharmacy_premises_licensees',
  'first_observed_at',
  'licensee first observation is retained'
);
SELECT col_is_fk(
  'public',
  'pharmacy_premises',
  'vpa_last_successful_run_id',
  'canonical VPA state identifies its successful source run'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'proprietor_names',
  'pharmacy premises has denormalised proprietor names'
);
SELECT has_column(
  'public',
  'pharmacy_premises',
  'vpa_last_synced_at',
  'pharmacy premises records its latest VPA sync'
);
SELECT has_table(
  'public',
  'pharmacy_premises_licensees',
  'VPA licensees table exists'
);
SELECT has_table(
  'public',
  'pharmacy_vpa_runs',
  'VPA refresh run table exists'
);
SELECT col_is_fk(
  'public',
  'pharmacy_premises_licensees',
  'premises_id',
  'licensee premises reference is enforced'
);
SELECT policies_are(
  'public',
  'pharmacy_premises_licensees',
  ARRAY['VPA licensees admin write', 'VPA licensees readable by authenticated']
);
SELECT policies_are(
  'public',
  'pharmacy_vpa_runs',
  ARRAY['VPA runs admin access']
);
SELECT is(
  (SELECT count(*)::integer FROM public.source_records
   WHERE source_key = 'vpa_public_register'),
  1,
  'VPA source is seeded exactly once'
);
SELECT is(
  (SELECT source_url FROM public.source_records
   WHERE source_key = 'vpa_public_register'),
  'https://pharmacy.vic.gov.au/register-search/',
  'VPA source retains the authoritative URL'
);
SELECT is(
  (SELECT confidence FROM public.source_records
   WHERE source_key = 'vpa_public_register'),
  'authoritative',
  'VPA source is labelled authoritative'
);

SELECT * FROM finish();
ROLLBACK;
