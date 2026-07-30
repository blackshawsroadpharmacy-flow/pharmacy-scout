begin;

select plan(4);

select ok(
  not has_table_privilege('anon', 'public.pbs_approvals', 'select'),
  'anon cannot enumerate PBS approval rows and private notes'
);

select ok(
  has_table_privilege('authenticated', 'public.pbs_approvals', 'select'),
  'authenticated users retain PBS approval access'
);

insert into public.pharmacy_premises (
  id,
  name,
  address,
  premises_source,
  vpa_registration_status
) values (
  '00000000-0000-4000-8000-000000000001',
  'RLS fixture pharmacy',
  '1 Test Street',
  'manual',
  'unverified'
);

insert into public.pbs_approvals (
  premises_id,
  approval_number,
  approval_status
) values (
  '00000000-0000-4000-8000-000000000001',
  'WP1-RLS-FIXTURE',
  'verified'
);

set local role anon;

select results_eq(
  $$
    select pbs_approvals
    from public.public_pharmacy_dossier(
      '00000000-0000-4000-8000-000000000001'
    )
  $$,
  $$values ('[{"approval_number":"WP1-RLS-FIXTURE","approval_status":"verified"}]'::jsonb)$$,
  'anon reads only approved PBS fields through the bounded dossier'
);

select throws_ok(
  $$select notes from public.pbs_approvals limit 1$$,
  '42501', null,
  'anonymous callers cannot retrieve PBS internal notes'
);

reset role;

select * from finish();

rollback;
