-- WP15B: private, viewport-bounded acquisition stages for pharmacy map markers.

CREATE OR REPLACE FUNCTION public.pharmacy_pipeline_statuses(p_premises_ids UUID[])
RETURNS TABLE (
  premises_id UUID,
  business_id UUID,
  opportunity_id UUID,
  pipeline_stage public.pipeline_stage,
  listing_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT DISTINCT requested_id
    FROM unnest(COALESCE(p_premises_ids, ARRAY[]::UUID[])) AS requested_id
    WHERE requested_id IS NOT NULL
    LIMIT 500
  ),
  current_org AS (
    SELECT current_organisation_id AS organisation_id
    FROM public.profiles
    WHERE id = auth.uid()
      AND current_organisation_id IS NOT NULL
      AND public.is_org_member(current_organisation_id)
  )
  SELECT DISTINCT ON (b.premises_id)
    b.premises_id,
    b.id,
    o.id,
    o.pipeline_stage,
    b.listing_status
  FROM current_org current
  JOIN public.pharmacy_businesses b
    ON b.organisation_id = current.organisation_id
  JOIN requested r ON r.requested_id = b.premises_id
  JOIN public.opportunities o
    ON o.organisation_id = b.organisation_id
   AND o.business_id = b.id
   AND o.type = 'acquisition'
  ORDER BY b.premises_id, o.updated_at DESC
$$;

REVOKE ALL ON FUNCTION public.pharmacy_pipeline_statuses(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmacy_pipeline_statuses(UUID[]) TO authenticated;

COMMENT ON FUNCTION public.pharmacy_pipeline_statuses(UUID[]) IS
  'Returns organisation-private acquisition stages for at most 500 explicitly requested visible pharmacy premises.';
