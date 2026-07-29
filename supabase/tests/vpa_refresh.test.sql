BEGIN;
SELECT plan(11);

SELECT has_column('public', 'pharmacy_premises', 'vpa_record_key');
SELECT has_column('public', 'pharmacy_premises', 'proprietor_names');
SELECT has_column('public', 'pharmacy_premises', 'vpa_last_synced_at');
SELECT has_table('public', 'pharmacy_premises_licensees');
SELECT has_table('public', 'pharmacy_vpa_runs');
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
