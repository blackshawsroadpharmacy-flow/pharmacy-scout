BEGIN;
SELECT plan(14);

SELECT has_table(
  'public','dispensing_calibration_import_batches',
  'calibration import audit table exists'
);
SELECT has_column(
  'public','dispensing_calibration_observations','review_status',
  'observations have review state'
);
SELECT has_column(
  'public','dispensing_calibration_observations','inclusion_notes',
  'observations retain inclusion definitions'
);
SELECT has_column(
  'public','dispensing_calibration_observations','exclusion_notes',
  'observations retain exclusion definitions'
);
SELECT ok(
  NOT has_table_privilege('anon','public.dispensing_calibration_import_batches','SELECT'),
  'anonymous cannot read calibration imports'
);
SELECT function_privs_are(
  'public','calibration_observation_warnings',ARRAY['uuid'],'anon',ARRAY[]::text[],
  'anonymous cannot inspect private calibration warnings'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_calibration_import_batches),0::bigint,
  'no fabricated import batches exist'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_calibration_observations),0::bigint,
  'no fabricated observations exist'
);

INSERT INTO auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000001','authenticated','authenticated','cal-a@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','f1000000-0000-4000-8000-000000000002','authenticated','authenticated','cal-b@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.organisations (id,name,created_by) VALUES
('e2000000-0000-4000-8000-000000000001','Calibration A','e1000000-0000-4000-8000-000000000001'),
('f2000000-0000-4000-8000-000000000002','Calibration B','f1000000-0000-4000-8000-000000000002');
INSERT INTO public.organisation_members (organisation_id,user_id,role) VALUES
('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','admin'),
('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','admin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
INSERT INTO public.dispensing_calibration_import_batches (
  id,organisation_id,file_name,rows_received,rows_imported,rows_quarantined,imported_by
) VALUES (
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'genuine.csv',1,1,0,'e1000000-0000-4000-8000-000000000001'
);
INSERT INTO public.dispensing_calibration_observations (
  id,organisation_id,pharmacy_id,observed_scripts_per_day,
  evidence_period_start,evidence_period_end,trading_days_per_week,
  includes_private_prescriptions,includes_under_copayment,
  includes_daa_volume,includes_institutional_supply,
  source_type,source,confidence,entered_by,import_batch_id
)
SELECT
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',id,100,
  '2026-01-01','2026-03-31',6,true,true,false,false,
  'dispensing report','Owner-supplied source','medium',
  'e1000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001'
FROM public.pharmacy_premises ORDER BY id LIMIT 1;
SELECT is(
  (SELECT count(*) FROM public.dispensing_calibration_observations),1::bigint,
  'organisation A can read its genuine observation'
);
SELECT is(
  (SELECT review_status FROM public.dispensing_calibration_observations LIMIT 1),
  'unreviewed',
  'new genuine evidence starts unreviewed'
);
SELECT is(
  (SELECT count(*) FROM public.calibration_observation_warnings(
    'e2000000-0000-4000-8000-000000000001'
  )),1::bigint,
  'organisation member can inspect its warnings'
);

SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
SELECT is(
  (SELECT count(*) FROM public.dispensing_calibration_observations),0::bigint,
  'organisation B cannot read organisation A observations'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_calibration_import_batches),0::bigint,
  'organisation B cannot read organisation A import batches'
);
UPDATE public.dispensing_calibration_observations
SET observed_scripts_per_day=1
WHERE id='e4000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT is(
  (SELECT observed_scripts_per_day FROM public.dispensing_calibration_observations
   WHERE id='e4000000-0000-4000-8000-000000000001'),
  100::numeric,
  'organisation B cannot alter organisation A observations'
);

SELECT * FROM finish();
ROLLBACK;
