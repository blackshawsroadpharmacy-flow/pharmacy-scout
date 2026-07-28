BEGIN;
SELECT plan(16);

SELECT ok(NOT has_table_privilege('anon', 'public.opportunity_tasks', 'SELECT'), 'anonymous cannot read tasks');
SELECT ok(NOT has_table_privilege('anon', 'public.opportunity_notes', 'SELECT'), 'anonymous cannot read opportunity notes');
SELECT ok(NOT has_table_privilege('anon', 'public.opportunity_documents', 'SELECT'), 'anonymous cannot read document metadata');
SELECT ok(NOT has_table_privilege('anon', 'public.opportunity_commercial_figures', 'SELECT'), 'anonymous cannot read commercial figures');
SELECT ok(has_table_privilege('authenticated', 'public.opportunity_tasks', 'INSERT'), 'authenticated members can create tasks through RLS');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'information-memorandums'), false, 'IM bucket remains private');
SELECT has_index('public', 'opportunity_stage_history', 'ix_opportunity_stage_history_opp', 'stage history is indexed');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001','authenticated','authenticated','workspace-a@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000002','authenticated','authenticated','workspace-b@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.organisations (id, name, created_by) VALUES
('c2000000-0000-4000-8000-000000000001','Workspace A','c1000000-0000-4000-8000-000000000001'),
('d2000000-0000-4000-8000-000000000002','Workspace B','d1000000-0000-4000-8000-000000000002');
INSERT INTO public.organisation_members (organisation_id,user_id,role) VALUES
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','admin'),
('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','admin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
INSERT INTO public.pharmacy_businesses (id, organisation_id, trading_name, created_by)
VALUES ('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Private Pharmacy','c1000000-0000-4000-8000-000000000001');
INSERT INTO public.opportunities (id, organisation_id, type, title, business_id, created_by)
VALUES ('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','acquisition','Private Pharmacy','c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001');
INSERT INTO public.opportunity_tasks (id, organisation_id, opportunity_id, title, created_by)
VALUES ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Review lease','c1000000-0000-4000-8000-000000000001');
INSERT INTO public.opportunity_commercial_figures (
  id, organisation_id, opportunity_id, metric, amount, unit, source, confidence, entered_by
) VALUES (
  'c6000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001','revenue',100,'AUD_per_year','Vendor IM','medium',
  'c1000000-0000-4000-8000-000000000001'
);
SELECT is((SELECT count(*) FROM public.opportunity_tasks), 1::bigint, 'organisation A reads its task');
SELECT is((SELECT count(*) FROM public.opportunity_stage_history WHERE opportunity_id='c4000000-0000-4000-8000-000000000001'), 1::bigint, 'initial stage is recorded');
SELECT throws_ok(
  $$INSERT INTO public.opportunities (organisation_id,type,title,business_id,created_by)
    VALUES ('c2000000-0000-4000-8000-000000000001','acquisition','Duplicate','c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')$$,
  '23505', 'An active opportunity already exists for this pharmacy business',
  'duplicate active opportunities are rejected'
);

SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*) FROM public.opportunities WHERE id='c4000000-0000-4000-8000-000000000001'), 0::bigint, 'organisation B cannot read organisation A opportunity');
SELECT is((SELECT count(*) FROM public.opportunity_tasks WHERE opportunity_id='c4000000-0000-4000-8000-000000000001'), 0::bigint, 'organisation B cannot read organisation A tasks');
SELECT is((SELECT count(*) FROM public.opportunity_commercial_figures WHERE opportunity_id='c4000000-0000-4000-8000-000000000001'), 0::bigint, 'organisation B cannot read organisation A figures');
UPDATE public.opportunity_tasks SET title='stolen' WHERE id='c5000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT is((SELECT title FROM public.opportunity_tasks WHERE id='c5000000-0000-4000-8000-000000000001'), 'Review lease', 'organisation B cannot update organisation A tasks');
SELECT is((SELECT count(*) FROM public.opportunity_commercial_figures WHERE amount=0), 0::bigint, 'missing figures are not represented as zero');
SELECT is((SELECT count(*) FROM public.opportunity_documents), 0::bigint, 'no private document metadata is seeded publicly');

SELECT * FROM finish();
ROLLBACK;
