BEGIN;

SELECT plan(24);

SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_profiles', 'SELECT'),
  'anonymous users cannot read commercial pharmacy profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_profiles', 'INSERT'),
  'anonymous users cannot create commercial pharmacy profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_profiles', 'UPDATE'),
  'anonymous users cannot update commercial pharmacy profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_profiles', 'DELETE'),
  'anonymous users cannot delete commercial pharmacy profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_note_entries', 'SELECT'),
  'anonymous users cannot read private notes'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_note_entries', 'INSERT'),
  'anonymous users cannot create private notes'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_im_attachments', 'SELECT'),
  'anonymous users cannot read information-memorandum metadata'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_im_attachments', 'INSERT'),
  'anonymous users cannot create information-memorandum metadata'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_im_attachments', 'UPDATE'),
  'anonymous users cannot update information-memorandum metadata'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.pharmacy_im_attachments', 'DELETE'),
  'anonymous users cannot delete information-memorandum metadata'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.relocation_scenarios', 'SELECT'),
  'anonymous users cannot read saved private scenarios'
);
SELECT ok(
  has_table_privilege('service_role', 'public.pharmacy_profiles', 'SELECT')
    AND has_table_privilege('service_role', 'public.pharmacy_profiles', 'INSERT')
    AND has_table_privilege('service_role', 'public.pharmacy_profiles', 'UPDATE')
    AND has_table_privilege('service_role', 'public.pharmacy_profiles', 'DELETE'),
  'service-role commercial access remains functional'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'information-memorandums'),
  false,
  'information-memorandum storage is private'
);
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'information-memorandums'),
  26214400::bigint,
  'private attachment size is limited to 25 MB'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'Public can % im bucket objects'
  ),
  0::bigint,
  'demo-era anonymous storage policies are removed'
);
SELECT function_privs_are(
  'public', 'organisation_security_status', ARRAY[]::text[],
  'anon', ARRAY[]::text[], 'anonymous users cannot execute the security-status function'
);
SELECT function_privs_are(
  'public', 'organisation_security_status', ARRAY[]::text[],
  'authenticated', ARRAY['EXECUTE'], 'authenticated administrators may request security status'
);
SELECT function_privs_are(
  'public', 'pharmacy_points_in_viewport',
  ARRAY['double precision', 'double precision', 'double precision', 'double precision',
        'boolean', 'boolean', 'integer'],
  'anon', ARRAY['EXECUTE'], 'public viewport discovery remains available'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'security-a@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'security-b@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

INSERT INTO public.organisations (id, name, created_by) VALUES
  (
    'a2000000-0000-4000-8000-000000000001',
    'Security fixture organisation A',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'Security fixture organisation B',
    'b1000000-0000-4000-8000-000000000002'
  );
INSERT INTO public.organisation_members (organisation_id, user_id, role) VALUES
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'admin'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'admin'
  );
UPDATE public.profiles
SET current_organisation_id = CASE id
  WHEN 'a1000000-0000-4000-8000-000000000001'
    THEN 'a2000000-0000-4000-8000-000000000001'::uuid
  ELSE 'b2000000-0000-4000-8000-000000000002'::uuid
END
WHERE id IN (
  'a1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000002'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SELECT lives_ok(
  format(
    $sql$
      INSERT INTO public.pharmacy_profiles (
        id, premises_id, organisation_id, created_by, status
      )
      SELECT
        'a3000000-0000-4000-8000-000000000001',
        id,
        'a2000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'target'
      FROM public.pharmacy_premises
      ORDER BY id
      LIMIT 1
    $sql$
  ),
  'same-organisation member can create a private profile'
);
SELECT is(
  (
    SELECT count(*) FROM public.pharmacy_profiles
    WHERE id = 'a3000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'same-organisation member can read its private profile'
);
SELECT is(
  (
    SELECT count(*) FROM public.commercial_audit_events
    WHERE entity_id = 'a3000000-0000-4000-8000-000000000001'
      AND action = 'create'
  ),
  1::bigint,
  'commercial create actions are audited without document content'
);
SELECT is(
  (public.organisation_security_status() ->> 'organisation_id'),
  'a2000000-0000-4000-8000-000000000001',
  'organisation administrator receives only its current security status'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000002',
  true
);
SELECT is(
  (
    SELECT count(*) FROM public.pharmacy_profiles
    WHERE id = 'a3000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'organisation B cannot read organisation A commercial records'
);
UPDATE public.pharmacy_profiles
SET asking_price = 1
WHERE id = 'a3000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT is(
  (
    SELECT asking_price FROM public.pharmacy_profiles
    WHERE id = 'a3000000-0000-4000-8000-000000000001'
  ),
  NULL::numeric,
  'organisation B cannot update organisation A commercial records'
);

SELECT * FROM finish();
ROLLBACK;
