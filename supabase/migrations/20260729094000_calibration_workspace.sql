-- WP20: organisation-private calibration evidence workflow.
-- Additive only. No observations are seeded and no predictive model is fitted.

CREATE TABLE public.dispensing_calibration_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  source_note TEXT,
  rows_received INTEGER NOT NULL DEFAULT 0 CHECK (rows_received >= 0),
  rows_imported INTEGER NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
  rows_quarantined INTEGER NOT NULL DEFAULT 0 CHECK (rows_quarantined >= 0),
  quarantine_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rows_imported + rows_quarantined = rows_received)
);

ALTER TABLE public.dispensing_calibration_observations
  ADD COLUMN import_batch_id UUID
    REFERENCES public.dispensing_calibration_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN inclusion_notes TEXT,
  ADD COLUMN exclusion_notes TEXT,
  ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','in_review','verified','rejected')),
  ADD COLUMN reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_notes TEXT,
  ADD CONSTRAINT calibration_review_metadata_consistent CHECK (
    (review_status IN ('unreviewed','in_review') AND reviewed_at IS NULL)
    OR (review_status IN ('verified','rejected') AND reviewed_at IS NOT NULL)
  );

CREATE INDEX ix_calibration_observation_org_pharmacy_period
  ON public.dispensing_calibration_observations
  (organisation_id, pharmacy_id, evidence_period_start, evidence_period_end);
CREATE INDEX ix_calibration_observation_org_review
  ON public.dispensing_calibration_observations (organisation_id, review_status);

ALTER TABLE public.dispensing_calibration_import_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.dispensing_calibration_import_batches TO authenticated;
GRANT ALL ON public.dispensing_calibration_import_batches TO service_role;

CREATE POLICY calibration_batches_org_select
  ON public.dispensing_calibration_import_batches
  FOR SELECT TO authenticated
  USING (public.is_org_member(organisation_id));
CREATE POLICY calibration_batches_org_insert
  ON public.dispensing_calibration_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organisation_id)
    AND imported_by = auth.uid()
  );
CREATE POLICY calibration_batches_org_update
  ON public.dispensing_calibration_import_batches
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organisation_id))
  WITH CHECK (public.is_org_member(organisation_id));

CREATE OR REPLACE FUNCTION public.calibration_observation_warnings(
  target_organisation_id UUID
)
RETURNS TABLE (
  observation_id UUID,
  overlap_count BIGINT,
  inconsistent_inclusion_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    current_observation.id,
    count(other.id) FILTER (
      WHERE daterange(
        current_observation.evidence_period_start,
        current_observation.evidence_period_end,
        '[]'
      ) && daterange(other.evidence_period_start, other.evidence_period_end, '[]')
    ) AS overlap_count,
    count(other.id) FILTER (
      WHERE (
        current_observation.includes_private_prescriptions,
        current_observation.includes_under_copayment,
        current_observation.includes_daa_volume,
        current_observation.includes_institutional_supply
      ) IS DISTINCT FROM (
        other.includes_private_prescriptions,
        other.includes_under_copayment,
        other.includes_daa_volume,
        other.includes_institutional_supply
      )
    ) AS inconsistent_inclusion_count
  FROM public.dispensing_calibration_observations current_observation
  LEFT JOIN public.dispensing_calibration_observations other
    ON other.organisation_id = current_observation.organisation_id
   AND other.pharmacy_id = current_observation.pharmacy_id
   AND other.id <> current_observation.id
  WHERE current_observation.organisation_id = target_organisation_id
    AND public.is_org_member(target_organisation_id)
  GROUP BY current_observation.id;
$$;

REVOKE ALL ON FUNCTION public.calibration_observation_warnings(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calibration_observation_warnings(UUID) TO authenticated;

COMMENT ON TABLE public.dispensing_calibration_import_batches IS
  'Organisation-private audit log for genuine scripts/day CSV imports; rejected rows are counted, not fabricated.';
COMMENT ON FUNCTION public.calibration_observation_warnings(UUID) IS
  'Reports overlapping evidence periods and inconsistent inclusion definitions within the requesting member organisation.';
