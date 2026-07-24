CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'rule_result_status'
  ) THEN
    CREATE TYPE public.rule_result_status AS ENUM (
      'appears_to_satisfy',
      'does_not_appear_to_satisfy',
      'insufficient_evidence',
      'professional_measurement_required',
      'not_applicable',
      'source_coverage_incomplete'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legislative_source TEXT NOT NULL,
  handbook_version TEXT,
  effective_from DATE,
  effective_to DATE,
  checksum TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.rule_versions(id) ON DELETE CASCADE,
  item_number TEXT NOT NULL,
  title TEXT NOT NULL,
  workflow_type TEXT NOT NULL,
  reference_citation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_version_id, item_number)
);

CREATE TABLE IF NOT EXISTS public.rule_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.rules(id) ON DELETE CASCADE,
  requirement_code TEXT NOT NULL,
  description TEXT NOT NULL,
  measurement_type TEXT,
  operator TEXT,
  threshold NUMERIC,
  units TEXT,
  comparison_inclusive BOOLEAN,
  reference_citation TEXT,
  data_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_id, requirement_code)
);

CREATE TABLE IF NOT EXISTS public.relocation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_pharmacy_id UUID REFERENCES public.pharmacy_premises(id) ON DELETE SET NULL,
  destination_address TEXT,
  destination_location GEOGRAPHY(POINT, 4326),
  destination_door_point GEOGRAPHY(POINT, 4326),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rule_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES public.relocation_scenarios(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.rules(id) ON DELETE CASCADE,
  status public.rule_result_status NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dataset_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_evaluation_id UUID NOT NULL REFERENCES public.rule_evaluations(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.rule_requirements(id) ON DELETE CASCADE,
  status public.rule_result_status NOT NULL,
  calculated_value NUMERIC,
  threshold NUMERIC,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rules_rule_version_id
  ON public.rules (rule_version_id);

CREATE INDEX IF NOT EXISTS ix_rule_requirements_rule_id
  ON public.rule_requirements (rule_id);

CREATE INDEX IF NOT EXISTS ix_rule_evaluations_scenario_id
  ON public.rule_evaluations (scenario_id);

CREATE INDEX IF NOT EXISTS ix_rule_evaluations_rule_id
  ON public.rule_evaluations (rule_id);

CREATE INDEX IF NOT EXISTS ix_requirement_evaluations_rule_evaluation_id
  ON public.requirement_evaluations (rule_evaluation_id);

CREATE INDEX IF NOT EXISTS ix_relocation_scenarios_origin_pharmacy_id
  ON public.relocation_scenarios (origin_pharmacy_id);

CREATE INDEX IF NOT EXISTS ix_relocation_scenarios_destination_location
  ON public.relocation_scenarios USING GIST (destination_location);

CREATE INDEX IF NOT EXISTS ix_relocation_scenarios_destination_door_point
  ON public.relocation_scenarios USING GIST (destination_door_point);

GRANT SELECT ON public.rule_versions TO anon, authenticated;
GRANT SELECT ON public.rules TO anon, authenticated;
GRANT SELECT ON public.rule_requirements TO anon, authenticated;
GRANT SELECT ON public.rule_evaluations TO anon, authenticated;
GRANT SELECT ON public.requirement_evaluations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.relocation_scenarios TO anon, authenticated;

GRANT ALL ON public.rule_versions TO service_role;
GRANT ALL ON public.rules TO service_role;
GRANT ALL ON public.rule_requirements TO service_role;
GRANT ALL ON public.relocation_scenarios TO service_role;
GRANT ALL ON public.rule_evaluations TO service_role;
GRANT ALL ON public.requirement_evaluations TO service_role;

ALTER TABLE public.rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relocation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read rule versions" ON public.rule_versions;
CREATE POLICY "Public can read rule versions"
  ON public.rule_versions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read rules" ON public.rules;
CREATE POLICY "Public can read rules"
  ON public.rules FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read rule requirements" ON public.rule_requirements;
CREATE POLICY "Public can read rule requirements"
  ON public.rule_requirements FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read relocation scenarios" ON public.relocation_scenarios;
CREATE POLICY "Public can read relocation scenarios"
  ON public.relocation_scenarios FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can create relocation scenarios" ON public.relocation_scenarios;
CREATE POLICY "Public can create relocation scenarios"
  ON public.relocation_scenarios FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update relocation scenarios" ON public.relocation_scenarios;
CREATE POLICY "Public can update relocation scenarios"
  ON public.relocation_scenarios FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read rule evaluations" ON public.rule_evaluations;
CREATE POLICY "Public can read rule evaluations"
  ON public.rule_evaluations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read requirement evaluations" ON public.requirement_evaluations;
CREATE POLICY "Public can read requirement evaluations"
  ON public.requirement_evaluations FOR SELECT TO anon, authenticated USING (true);

WITH version_row AS (
  INSERT INTO public.rule_versions (
    name,
    legislative_source,
    handbook_version,
    effective_from,
    checksum,
    active
  )
  VALUES (
    'Pharmacy Location Rules relocation extract',
    'National Health Act 1953 s90 / Division 4B and section 99L determinations',
    'Applicant''s Handbook March 2026 V1.10',
    DATE '2026-03-01',
    'handbook-march-2026-v1.10-items-122-125',
    false
  )
  ON CONFLICT DO NOTHING
  RETURNING id
), resolved_version AS (
  SELECT id FROM version_row
  UNION ALL
  SELECT id
  FROM public.rule_versions
  WHERE checksum = 'handbook-march-2026-v1.10-items-122-125'
  LIMIT 1
), inserted_rules AS (
  INSERT INTO public.rules (rule_version_id, item_number, title, workflow_type, reference_citation)
  SELECT id, item_number, title, 'relocation', citation
  FROM resolved_version
  CROSS JOIN (
    VALUES
      ('122', 'Relocation within a designated complex', 'Handbook March 2026 V1.10, Item 122, pp. 22-23'),
      ('123', 'Relocation within the same town (10 km)', 'Handbook March 2026 V1.10, Item 123, pp. 24-25'),
      ('124', 'Relocation up to 1 km', 'Handbook March 2026 V1.10, Item 124, pp. 26-28'),
      ('125', 'Relocation of 1 to 1.5 km', 'Handbook March 2026 V1.10, Item 125, pp. 29-31')
  ) AS seed(item_number, title, citation)
  ON CONFLICT (rule_version_id, item_number) DO NOTHING
  RETURNING id, item_number
), resolved_rules AS (
  SELECT r.id, r.item_number
  FROM public.rules r
  JOIN resolved_version v ON v.id = r.rule_version_id
  WHERE r.item_number IN ('122', '123', '124', '125')
)
INSERT INTO public.rule_requirements (
  rule_id,
  requirement_code,
  description,
  measurement_type,
  operator,
  threshold,
  units,
  comparison_inclusive,
  reference_citation,
  data_requirements,
  evidence_requirements
)
SELECT
  rr.id,
  seed.requirement_code,
  seed.description,
  seed.measurement_type,
  seed.operator,
  seed.threshold,
  seed.units,
  seed.comparison_inclusive,
  seed.reference_citation,
  seed.data_requirements::jsonb,
  seed.evidence_requirements::jsonb
FROM resolved_rules rr
JOIN (
  VALUES
    (
      '122',
      'same_designated_complex',
      'Proposed premises are in the same designated complex as the existing premises.',
      'evidence',
      '=',
      NULL::numeric,
      NULL::text,
      NULL::boolean,
      'Handbook March 2026 V1.10, Item 122, pp. 22-23',
      '{"complex_type": true, "boundary_evidence": true, "single_management_evidence_when_relevant": true}',
      '{"required_documents": ["floor_plan", "complex_boundary_proof", "management_or_governing_body_declaration"]}'
    ),
    (
      '123',
      'same_town',
      'Proposed premises are in the same town as the existing premises.',
      'locality',
      '=',
      NULL::numeric,
      NULL::text,
      NULL::boolean,
      'Handbook March 2026 V1.10, Item 123, pp. 24-25; glossary same town p. 57',
      '{"town_name": true, "postcode": true}',
      '{"required_documents": ["locality_map_or_official_locality_reference"]}'
    ),
    (
      '123',
      'route_distance_ge_10km',
      'Proposed premises are at least 10 km by the shortest lawful access route from the nearest approved premises other than the existing premises.',
      'shortest_lawful_access_route',
      '>=',
      10000,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 123, pp. 24-25',
      '{"confirmed_pbs_coverage_required": true, "competitor_set": "nearest_other_approved", "door_points": true, "route_provider": true}',
      '{"required_documents": ["scaled_map_or_surveyor_report_when_near_threshold"]}'
    ),
    (
      '124',
      'distance_le_1km',
      'Proposed premises are no more than 1 km in a straight line from the existing premises.',
      'straight_line',
      '<=',
      1000,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 124, pp. 26-28',
      '{"origin_door_point": true, "destination_door_point": true}',
      '{"required_documents": ["scaled_map_or_surveyor_report_when_near_threshold"]}'
    ),
    (
      '124',
      'not_in_designated_complex',
      'Existing premises are not in a designated complex.',
      'classification',
      '=',
      NULL::numeric,
      NULL::text,
      NULL::boolean,
      'Handbook March 2026 V1.10, Item 124, pp. 26-28',
      '{"existing_complex_classification": true}',
      '{"required_documents": ["photo_or_building_owner_confirmation_when_claiming_not_in_complex"]}'
    ),
    (
      '124',
      'large_shopping_centre_all_outside_ge_300m',
      'If the existing premises are in a large shopping centre, proposed premises are at least 300 m in a straight line from all approved premises not in that large shopping centre.',
      'straight_line_all_competitors',
      '>=',
      300,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 124, pp. 26-28',
      '{"confirmed_pbs_coverage_required": true, "competitor_set": "all_approved_outside_same_large_shopping_centre"}',
      '{"required_documents": ["complex_evidence", "distance_evidence"]}'
    ),
    (
      '124',
      'small_sc_lmc_lph_all_outside_ge_500m',
      'If the existing premises are in a small shopping centre, large medical centre or large private hospital, proposed premises are at least 500 m in a straight line from all approved premises not in that same complex.',
      'straight_line_all_competitors',
      '>=',
      500,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 124, pp. 26-28',
      '{"confirmed_pbs_coverage_required": true, "competitor_set": "all_approved_outside_same_complex"}',
      '{"required_documents": ["complex_evidence", "distance_evidence"]}'
    ),
    (
      '125',
      'distance_gt_1km',
      'Proposed premises are more than 1 km in a straight line from the existing premises.',
      'straight_line',
      '>',
      1000,
      'm',
      false,
      'Handbook March 2026 V1.10, Item 125, pp. 29-31',
      '{"origin_door_point": true, "destination_door_point": true}',
      '{"required_documents": ["scaled_map_or_surveyor_report_when_near_threshold"]}'
    ),
    (
      '125',
      'distance_le_1_5km',
      'Proposed premises are no more than 1.5 km in a straight line from the existing premises.',
      'straight_line',
      '<=',
      1500,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 125, pp. 29-31',
      '{"origin_door_point": true, "destination_door_point": true}',
      '{"required_documents": ["scaled_map_or_surveyor_report_when_near_threshold"]}'
    ),
    (
      '125',
      'standalone_nearest_ge_300m',
      'If the existing premises are not in a designated complex, proposed premises are at least 300 m in a straight line from the nearest approved premises.',
      'straight_line_nearest_competitor',
      '>=',
      300,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 125, pp. 29-31',
      '{"confirmed_pbs_coverage_required": true, "competitor_set": "nearest_approved"}',
      '{"required_documents": ["distance_evidence"]}'
    ),
    (
      '125',
      'large_shopping_centre_nearest_ge_300m',
      'If the existing premises are in a large shopping centre, proposed premises are at least 300 m in a straight line from the nearest approved premises.',
      'straight_line_nearest_competitor',
      '>=',
      300,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 125, pp. 29-31',
      '{"confirmed_pbs_coverage_required": true, "competitor_set": "nearest_approved"}',
      '{"required_documents": ["complex_evidence", "distance_evidence"]}'
    ),
    (
      '125',
      'small_sc_lmc_lph_nearest_ge_500m',
      'If the existing premises are in a small shopping centre, large medical centre or large private hospital, proposed premises are at least 500 m in a straight line from the nearest approved premises.',
      'straight_line_nearest_competitor',
      '>=',
      500,
      'm',
      true,
      'Handbook March 2026 V1.10, Item 125, pp. 29-31',
      '{"confirmed_pbs_coverage_required": true, "competitor_set": "nearest_approved"}',
      '{"required_documents": ["complex_evidence", "distance_evidence"]}'
    )
) AS seed(
  item_number,
  requirement_code,
  description,
  measurement_type,
  operator,
  threshold,
  units,
  comparison_inclusive,
  reference_citation,
  data_requirements,
  evidence_requirements
) ON seed.item_number = rr.item_number
ON CONFLICT (rule_id, requirement_code) DO NOTHING;
