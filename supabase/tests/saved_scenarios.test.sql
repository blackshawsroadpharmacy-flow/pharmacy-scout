BEGIN;
SELECT plan(10);
SELECT ok(NOT has_table_privilege('anon','public.greenfield_scenarios','SELECT'),'anonymous cannot read greenfield scenarios');
SELECT ok(NOT has_table_privilege('anon','public.greenfield_assessments','SELECT'),'anonymous cannot read greenfield assessments');
SELECT ok(NOT has_table_privilege('anon','public.relocation_assessments','SELECT'),'anonymous cannot read relocation assessments');
SELECT function_privs_are('public','scenario_evidence_at_point',
  ARRAY['double precision','double precision','integer'],'anon',ARRAY[]::text[],
  'anonymous cannot request scenario evidence');
SELECT function_privs_are('public','scenario_evidence_at_point',
  ARRAY['double precision','double precision','integer'],'authenticated',ARRAY['EXECUTE'],
  'authenticated workflow can request server evidence');
SELECT has_table('public','greenfield_scenarios','greenfield model exists');
SELECT has_table('public','relocation_scenarios','relocation model remains separate');
SELECT has_table('public','greenfield_assessments','greenfield evidence history exists');
SELECT has_table('public','relocation_assessments','relocation evidence history exists');
SELECT has_trigger(
  'public','greenfield_assessments','trg_greenfield_assessments_immutable',
  'assessment history has an immutability trigger'
);
SELECT * FROM finish();
ROLLBACK;
