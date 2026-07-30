BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'watch-owner@example.test'),
  ('c1000000-0000-4000-8000-000000000002', 'watch-peer@example.test');
INSERT INTO public.organisations (id, name, created_by) VALUES (
  'c2000000-0000-4000-8000-000000000001', 'Watch Org',
  'c1000000-0000-4000-8000-000000000001'
);
INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES
  ('c2000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000001', 'member'),
  ('c2000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000002', 'member');
INSERT INTO public.pharmacy_premises (
  id, name, address, premises_source
) VALUES (
  'c3000000-0000-4000-8000-000000000001',
  'Watch Pharmacy', '1 Watch Street', 'vpa_register'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SELECT lives_ok(
  $$INSERT INTO public.vpa_alert_watches (
      id, organisation_id, premises_id, created_by
    ) VALUES (
      'c4000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001'
    )$$,
  'organisation member may create their own personal watch'
);
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 1,
  'watch creator sees their watch');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 0,
  'same-organisation peer cannot read another member watch');
UPDATE public.vpa_alert_watches
SET registration_changes = false
WHERE id = 'c4000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 0,
  'same-organisation peer cannot update another member watch');
DELETE FROM public.vpa_alert_watches
WHERE id = 'c4000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 0,
  'same-organisation peer cannot delete another member watch');
SELECT lives_ok(
  $$INSERT INTO public.vpa_alert_watches (
      id, organisation_id, premises_id, created_by
    ) VALUES (
      'c4000000-0000-4000-8000-000000000002',
      'c2000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000002'
    )$$,
  'same organisation may hold a separate personal watch'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.vpa_alert_watches), 2,
  'both personal watches remain independently stored');

SELECT * FROM finish();
ROLLBACK;
