-- Enumerates every organisation-scoped table and fails if `anon` holds ANY
-- privilege on it. The earlier hardening migration revoked anon on five tables
-- but left seven others relying on RLS alone; this makes that class of omission
-- impossible to reintroduce without a failing test.

BEGIN;

SELECT plan(1);

SELECT is_empty(
  $$
    SELECT g.table_name || ':' || g.privilege_type
    FROM information_schema.role_table_grants g
    WHERE g.grantee = 'anon'
      AND g.table_schema = 'public'
      AND g.table_name IN (
        'organisations',
        'organisation_members',
        'profiles',
        'user_roles',
        'pharmacy_businesses',
        'opportunities',
        'candidate_sites',
        'pharmacy_profiles',
        'pharmacy_note_entries',
        'pharmacy_im_attachments',
        'relocation_scenarios',
        'greenfield_scenarios',
        'greenfield_assessments',
        'relocation_assessments',
        'rule_evaluations',
        'requirement_evaluations',
        'dispensing_calibration_observations',
        'commercial_audit_events',
        'organisation_invitations'
      )
    ORDER BY 1
  $$,
  'anon holds no privilege on any organisation-scoped table'
);

SELECT * FROM finish();

ROLLBACK;
