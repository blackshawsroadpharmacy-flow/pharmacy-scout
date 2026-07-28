-- WP16: organisation-private saved planning scenarios with immutable assessments.
-- Greenfield and relocation intentionally use separate tables and workflows.

CREATE TABLE public.greenfield_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  proposed_address TEXT,
  proposed_location GEOGRAPHY(POINT, 4326) NOT NULL,
  proposed_lat DOUBLE PRECISION NOT NULL CHECK (proposed_lat BETWEEN -39.2 AND -33.98),
  proposed_lng DOUBLE PRECISION NOT NULL CHECK (proposed_lng BETWEEN 140.96 AND 149.98),
  notes TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  duplicated_from UUID REFERENCES public.greenfield_scenarios(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.relocation_scenarios
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicated_from UUID REFERENCES public.relocation_scenarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.relocation_scenarios
  ADD COLUMN IF NOT EXISTS destination_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS destination_lng DOUBLE PRECISION;

UPDATE public.relocation_scenarios SET name = 'Legacy relocation scenario' WHERE name IS NULL;
ALTER TABLE public.relocation_scenarios ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.relocation_scenarios
  ADD CONSTRAINT relocation_saved_scenario_complete
  CHECK (
    orphaned_demo
    OR (origin_pharmacy_id IS NOT NULL AND destination_location IS NOT NULL)
  ) NOT VALID;

CREATE TABLE public.greenfield_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.greenfield_scenarios(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash TEXT NOT NULL,
  assessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, sequence_number)
);

CREATE TABLE public.relocation_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.relocation_scenarios(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  origin_evidence_snapshot JSONB NOT NULL,
  destination_evidence_snapshot JSONB NOT NULL,
  comparison_snapshot JSONB NOT NULL,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash TEXT NOT NULL,
  assessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, sequence_number)
);

CREATE INDEX ix_greenfield_scenarios_org_updated
  ON public.greenfield_scenarios (organisation_id, archived_at, updated_at DESC);
CREATE INDEX ix_relocation_scenarios_org_updated
  ON public.relocation_scenarios (organisation_id, archived_at, updated_at DESC);
CREATE INDEX ix_greenfield_assessments_scenario
  ON public.greenfield_assessments (scenario_id, sequence_number DESC);
CREATE INDEX ix_relocation_assessments_scenario
  ON public.relocation_assessments (scenario_id, sequence_number DESC);

ALTER TABLE public.greenfield_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greenfield_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relocation_assessments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.greenfield_scenarios TO authenticated;
GRANT SELECT, INSERT ON public.greenfield_assessments TO authenticated;
GRANT SELECT, INSERT ON public.relocation_assessments TO authenticated;
GRANT ALL ON public.greenfield_scenarios, public.greenfield_assessments,
  public.relocation_assessments TO service_role;
REVOKE ALL ON public.greenfield_scenarios, public.greenfield_assessments,
  public.relocation_assessments FROM anon;

CREATE POLICY greenfield_scenarios_org_all ON public.greenfield_scenarios
  FOR ALL TO authenticated
  USING (public.is_org_member(organisation_id))
  WITH CHECK (public.is_org_member(organisation_id));
CREATE POLICY greenfield_assessments_org_select ON public.greenfield_assessments
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY greenfield_assessments_org_insert ON public.greenfield_assessments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_org_member(organisation_id)
    AND assessed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.greenfield_scenarios s
      WHERE s.id = scenario_id AND s.organisation_id = organisation_id
    )
  );
CREATE POLICY relocation_assessments_org_select ON public.relocation_assessments
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY relocation_assessments_org_insert ON public.relocation_assessments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_org_member(organisation_id)
    AND assessed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.relocation_scenarios s
      WHERE s.id = scenario_id AND s.organisation_id = organisation_id
    )
  );

CREATE TRIGGER trg_greenfield_scenarios_updated BEFORE UPDATE
  ON public.greenfield_scenarios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Assessments are immutable evidence records.
CREATE OR REPLACE FUNCTION public.reject_immutable_assessment_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Assessment evidence snapshots are immutable';
END;
$$;
CREATE TRIGGER trg_greenfield_assessments_immutable
  BEFORE UPDATE OR DELETE ON public.greenfield_assessments
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_assessment_change();
CREATE TRIGGER trg_relocation_assessments_immutable
  BEFORE UPDATE OR DELETE ON public.relocation_assessments
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_assessment_change();

CREATE OR REPLACE FUNCTION public.scenario_evidence_at_point(
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_radius_m INTEGER
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.candidate_site_analysis(p_lat, p_lng, p_radius_m)
    || jsonb_build_object(
      'evidence_contract_version', 'wp16-v1',
      'captured_at', now(),
      'missing_inputs', jsonb_build_array(
        'population is supplied separately from the sourced ABS area layer',
        'absence of mapped external entities is not evidence that none exist'
      )
    );
$$;
REVOKE ALL ON FUNCTION public.scenario_evidence_at_point(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scenario_evidence_at_point(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.scenario_origin_pharmacy(p_pharmacy_id UUID)
RETURNS TABLE (
  id UUID, name TEXT, address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  coordinate_quality TEXT, source_confidence TEXT, unresolved_conflicts BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.address,
    ST_Y(p.location::geometry), ST_X(p.location::geometry),
    COALESCE(p.geocode_method, 'unknown'), COALESCE(p.source_confidence, 'unknown'),
    (
      SELECT count(*) FROM public.pharmacy_premises d
      WHERE d.id <> p.id AND (
        lower(trim(d.address)) = lower(trim(p.address))
        OR (lower(trim(d.name)) = lower(trim(p.name))
          AND d.location IS NOT NULL AND ST_DWithin(d.location, p.location, 50))
      )
    )
  FROM public.pharmacy_premises p
  WHERE p.id = p_pharmacy_id AND p.location IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.scenario_origin_pharmacy(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scenario_origin_pharmacy(UUID) TO authenticated;

COMMENT ON TABLE public.greenfield_assessments IS
  'Immutable evidence snapshots. Recalculation inserts a new sequence; prior evidence is retained.';
COMMENT ON TABLE public.relocation_assessments IS
  'Immutable origin-versus-destination evidence and gained/lost comparison snapshots.';
