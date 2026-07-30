BEGIN;
SELECT plan(13);

SELECT has_column('public', 'pharmacy_premises', 'vpa_closed_first_observed_at',
  'closed-state observation timestamp exists');
SELECT has_column('public', 'pharmacy_premises', 'vpa_reopened_last_observed_at',
  'reopening observation timestamp exists');
SELECT has_column('public', 'pharmacy_premises', 'vpa_geocode_status',
  'explicit geocode state exists');
SELECT has_column('public', 'pharmacy_premises', 'vpa_pbs_match_state',
  'VPA and PBS identity states are separate');
SELECT has_table('public', 'pharmacy_vpa_geocode_results',
  'geocode evidence is retained');
SELECT policies_are(
  'public', 'pharmacy_vpa_geocode_results',
  ARRAY['pharmacy_vpa_geocode_results_admin'],
  'geocode evidence is restricted to administrators'
);
SELECT has_view('public', 'pharmacy_premises_vpa_lifecycle',
  'active and historical lifecycle view exists');
SELECT view_owner_is('public', 'pharmacy_premises_vpa_lifecycle', CURRENT_USER);
SELECT function_lang_is(
  'public', 'pharmacy_points_in_viewport',
  ARRAY['double precision', 'double precision', 'double precision', 'double precision',
    'boolean', 'boolean', 'integer'],
  'plpgsql',
  'active map RPC is replaced without changing its contract'
);

INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source,
  vpa_registration_status_normalised, vpa_last_observed_at
) VALUES (
  '00000000-0000-0000-0000-000000000601', 'Closed Fixture',
  '3 History Street', 'Melbourne', '3000',
  ST_SetSRID(ST_MakePoint(144.96, -37.82), 4326)::geography,
  'vpa_register', 'closed', '2026-07-29T13:34:38Z'
);
SELECT is(
  (SELECT vpa_pbs_match_state FROM public.pharmacy_premises
   WHERE id = '00000000-0000-0000-0000-000000000601'),
  'closed_historical',
  'explicit closed source state is historical, not verified'
);
SELECT is(
  (SELECT vpa_closed_first_observed_at FROM public.pharmacy_premises
   WHERE id = '00000000-0000-0000-0000-000000000601'),
  '2026-07-29T13:34:38Z'::timestamptz,
  'closure observation time comes from the source observation without inventing a closure date'
);
SELECT is(
  (SELECT included_in_default_active_map FROM public.pharmacy_premises_vpa_lifecycle
   WHERE id = '00000000-0000-0000-0000-000000000601'),
  false,
  'closed premises are excluded from the default active map'
);
UPDATE public.pharmacy_premises
SET vpa_registration_status_normalised = 'active',
    vpa_last_observed_at = '2026-07-30T01:00:00Z'
WHERE id = '00000000-0000-0000-0000-000000000601';
SELECT is(
  (SELECT vpa_reopened_last_observed_at FROM public.pharmacy_premises
   WHERE id = '00000000-0000-0000-0000-000000000601'),
  '2026-07-30T01:00:00Z'::timestamptz,
  'a later active snapshot records reversible reopening'
);

SELECT * FROM finish();
ROLLBACK;
