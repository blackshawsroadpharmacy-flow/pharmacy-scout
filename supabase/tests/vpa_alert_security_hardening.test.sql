BEGIN;
SELECT plan(18);

SELECT ok(
  has_table_privilege('authenticated', 'public.vpa_private_alerts', 'SELECT'),
  'authenticated users may select organisation-visible alerts'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.vpa_private_alerts', 'INSERT'),
  'authenticated users cannot insert alerts'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.vpa_private_alerts', 'DELETE'),
  'authenticated users cannot delete alerts'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.vpa_private_alerts', 'read_at', 'UPDATE'),
  'authenticated users may acknowledge alerts'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.vpa_private_alerts', 'title', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.vpa_private_alerts', 'body', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.vpa_private_alerts', 'alert_type', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.vpa_private_alerts', 'premises_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.vpa_private_alerts', 'organisation_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.vpa_private_alerts', 'change_event_id', 'UPDATE'),
  'system-generated alert content is not client-writable'
);

INSERT INTO auth.users (id, email) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'alert-a@example.test'),
  ('d1000000-0000-4000-8000-000000000002', 'alert-b@example.test');
INSERT INTO public.organisations (id, name, created_by) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'Alert A',
   'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'Alert B',
   'd1000000-0000-4000-8000-000000000002');
INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES
  ('d2000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'member'),
  ('d2000000-0000-4000-8000-000000000002',
   'd1000000-0000-4000-8000-000000000002', 'member');
INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, premises_source
) VALUES (
  'd3000000-0000-4000-8000-000000000001', 'Alert Pharmacy',
  '1 Alert Street', 'Melbourne', '3000', 'vpa_register'
);
INSERT INTO public.pharmacy_vpa_runs (
  id, status, triggered_by, source_file_hash, source_row_count, premises_count
) VALUES (
  'd4000000-0000-4000-8000-000000000001', 'promoted',
  'd1000000-0000-4000-8000-000000000001', repeat('d', 64), 1, 1
);
INSERT INTO public.vpa_alert_watches (
  id, organisation_id, premises_id, created_by
) VALUES (
  'd5000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
);
INSERT INTO public.pharmacy_vpa_change_events (
  id, run_id, premises_id, event_type, field_name, new_value
) VALUES (
  'd6000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'name_change', 'vpa_official_name', '"Updated name"'::jsonb
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_private_alerts
   WHERE change_event_id = 'd6000000-0000-4000-8000-000000000001'),
  1,
  'trusted event fan-out creates the alert without client INSERT privilege'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SELECT is((SELECT count(*)::integer FROM public.vpa_private_alerts), 1,
  'organisation A member sees its expected alert');
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 1,
  'organisation A member sees its expected watch');
SELECT lives_ok(
  $$UPDATE public.vpa_private_alerts SET read_at = now()
    WHERE change_event_id = 'd6000000-0000-4000-8000-000000000001'$$,
  'same-organisation member can update read_at'
);
SELECT throws_ok(
  $$INSERT INTO public.vpa_private_alerts (
      organisation_id, premises_id, alert_type, title, body, source_run_id
    ) VALUES (
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'fabricated', 'Fabricated', 'Fabricated',
      'd4000000-0000-4000-8000-000000000001'
    )$$,
  '42501', NULL, 'organisation member cannot insert an alert'
);
SELECT throws_ok(
  $$DELETE FROM public.vpa_private_alerts
    WHERE change_event_id = 'd6000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'organisation member cannot delete an alert'
);
SELECT throws_ok(
  $$UPDATE public.vpa_private_alerts SET title = 'Fabricated'
    WHERE change_event_id = 'd6000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'organisation member cannot modify alert content'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SELECT is((SELECT count(*)::integer FROM public.vpa_private_alerts), 0,
  'organisation B sees zero organisation A alerts');
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 0,
  'organisation B sees zero organisation A watches');
SELECT throws_ok(
  $$INSERT INTO public.vpa_alert_watches (
      organisation_id, premises_id, created_by
    ) VALUES (
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000002'
    )$$,
  '42501', NULL, 'cross-organisation watch insert is rejected'
);
UPDATE public.vpa_alert_watches
SET registration_changes = false
WHERE id = 'd5000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT registration_changes FROM public.vpa_alert_watches
   WHERE id = 'd5000000-0000-4000-8000-000000000001'),
  NULL::boolean,
  'cross-organisation watch update affects no visible row'
);
DELETE FROM public.vpa_alert_watches
WHERE id = 'd5000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_alert_watches
   WHERE id = 'd5000000-0000-4000-8000-000000000001'),
  1,
  'cross-organisation watch delete leaves the row intact'
);
SELECT is(
  (SELECT count(*)::integer FROM public.vpa_private_alerts
   WHERE change_event_id = 'd6000000-0000-4000-8000-000000000001'),
  1,
  'forbidden client mutations leave trusted alert evidence intact'
);

SELECT * FROM finish();
ROLLBACK;
