begin;

select plan(4);

select ok(
  has_table_privilege('anon', 'public.pbs_approvals', 'select'),
  'anon retains SELECT privilege on PBS approvals'
);

select policy_exists(
  'public',
  'pbs_approvals',
  'Public can read pbs approvals',
  'PBS approvals retain the explicit public-read policy'
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
  $$select count(*) from public.pbs_approvals where approval_number = 'WP1-RLS-FIXTURE'$$,
  $$values (1::bigint)$$,
  'anon can read a real linked PBS approval through RLS'
);

select results_eq(
  $$
    select count(*)
    from public.pharmacy_premises p
    where exists (
      select 1
      from public.pbs_approvals a
      where a.premises_id = p.id
    )
      and p.id = '00000000-0000-4000-8000-000000000001'
  $$,
  $$values (1::bigint)$$,
  'PBS-known membership is relational and does not depend on a nullable boolean flag'
);

reset role;

select * from finish();

rollback;
