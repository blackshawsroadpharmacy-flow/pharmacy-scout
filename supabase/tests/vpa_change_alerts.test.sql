BEGIN;
SELECT plan(18);

SELECT has_table('public', 'vpa_alert_watches',
  'organisation-private VPA watches exist');
SELECT has_table('public', 'vpa_private_alerts',
  'organisation-private VPA alerts exist');
SELECT has_table('public', 'vpa_gdp_staging_comparisons',
  'GDP comparison stays in an approval-gated staging table');
SELECT policies_are(
  'public', 'vpa_alert_watches',
  ARRAY['vpa_alert_watches_org_members'],
  'watch records are organisation isolated'
);
SELECT policies_are(
  'public', 'vpa_private_alerts',
  ARRAY['vpa_private_alerts_org_acknowledge', 'vpa_private_alerts_org_select'],
  'alerts have separate organisation-isolated read and acknowledgement policies'
);
SELECT policies_are(
  'public', 'vpa_gdp_staging_comparisons',
  ARRAY['vpa_gdp_staging_comparisons_admin'],
  'GDP staging comparisons require admin review'
);
SELECT has_trigger(
  'public', 'pharmacy_premises', 'trg_capture_vpa_premises_changes',
  'premises source changes create field-level events'
);
SELECT has_trigger(
  'public', 'pharmacy_premises_licensees', 'trg_capture_vpa_licensee_changes',
  'licensee source changes create field-level events'
);
SELECT has_trigger(
  'public', 'pharmacy_vpa_change_events', 'trg_create_private_vpa_alert',
  'source events fan out only to private watches'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_private_alerts),
  0,
  'migration creates no false alerts'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_gdp_staging_comparisons),
  0,
  'migration does not recompute GDP'
);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_vpa_change_events),
  0,
  'first snapshot has no fabricated delta events on migration apply'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000',
   'c1000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'vpa-a@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'c1000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'vpa-b@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());
INSERT INTO public.organisations (id, name, created_by) VALUES
  ('c2000000-0000-4000-8000-000000000001', 'VPA alert org A',
   'c1000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002', 'VPA alert org B',
   'c1000000-0000-4000-8000-000000000002');
INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES
  ('c2000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'admin'),
  ('c2000000-0000-4000-8000-000000000002',
   'c1000000-0000-4000-8000-000000000002', 'admin');
INSERT INTO public.pharmacy_vpa_runs (
  id, status, triggered_by, source_file_name, source_file_hash,
  source_reference_date, source_row_count, premises_count, licensee_count
) VALUES
  ('c3000000-0000-4000-8000-000000000001', 'promoted',
   'c1000000-0000-4000-8000-000000000001', 'baseline.csv', repeat('a', 64),
   '2026-07-29', 1, 1, 0);
INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, premises_source, vpa_record_key,
  vpa_registration_status_normalised, vpa_last_successful_run_id
) VALUES (
  'c4000000-0000-4000-8000-000000000001', 'Baseline Pharmacy',
  '1 Baseline Street', 'Melbourne', '3000', 'vpa_register', 'baseline-key',
  'active', 'c3000000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_vpa_change_events),
  0,
  'first successful snapshot establishes a baseline without false new events'
);

INSERT INTO public.vpa_alert_watches (
  organisation_id, premises_id, created_by
) VALUES (
  'c2000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001'
);
INSERT INTO public.pharmacy_vpa_runs (
  id, status, triggered_by, source_file_name, source_file_hash,
  source_reference_date, source_row_count, premises_count, licensee_count
) VALUES
  ('c3000000-0000-4000-8000-000000000002', 'promoted',
   'c1000000-0000-4000-8000-000000000001', 'second.csv', repeat('b', 64),
   '2026-07-30', 1, 1, 0);
UPDATE public.pharmacy_premises
SET vpa_registration_status_normalised = 'closed',
    vpa_registration_status_raw = 'Closed',
    vpa_last_successful_run_id = 'c3000000-0000-4000-8000-000000000002'
WHERE id = 'c4000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_vpa_change_events
   WHERE run_id = 'c3000000-0000-4000-8000-000000000002'
     AND event_type = 'closed'),
  1,
  'a second snapshot creates a real field-level closed event'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_private_alerts
   WHERE organisation_id = 'c2000000-0000-4000-8000-000000000001'
     AND alert_type = 'closed'),
  1,
  'a source event alerts only an organisation that watches the premises'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_private_alerts
   WHERE organisation_id = 'c2000000-0000-4000-8000-000000000002'),
  0,
  'unrelated organisations receive no private alert'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_private_alerts),
  0,
  'row-level security hides another organisation private alerts'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_alert_watches),
  0,
  'row-level security hides another organisation watch list'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
