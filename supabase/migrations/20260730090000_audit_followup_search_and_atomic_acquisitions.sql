-- Audit follow-up: keep user search text inside SQL parameters and make the
-- acquisition business/opportunity pair transactional.

CREATE INDEX IF NOT EXISTS ix_healthcare_anchors_search_name_trgm
  ON public.healthcare_anchors USING GIN (lower(canonical_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_healthcare_anchors_search_address_trgm
  ON public.healthcare_anchors USING GIN (lower(COALESCE(address, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_healthcare_anchors_search_suburb_trgm
  ON public.healthcare_anchors USING GIN (lower(COALESCE(suburb, '')) extensions.gin_trgm_ops);

DO $$
BEGIN
  IF to_regprocedure('public.statewide_location_search_without_healthcare(text,integer)') IS NULL THEN
    ALTER FUNCTION public.statewide_location_search(TEXT, INTEGER)
      RENAME TO statewide_location_search_without_healthcare;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.statewide_location_search_without_healthcare(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.statewide_location_search(
  p_query TEXT,
  p_limit INTEGER DEFAULT 24
)
RETURNS TABLE (
  result_type TEXT,
  result_id UUID,
  result_name TEXT,
  result_address TEXT,
  result_suburb TEXT,
  result_postcode TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  source_confidence TEXT,
  is_private BOOLEAN,
  relevance DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  q TEXT := lower(trim(COALESCE(p_query, '')));
  bounded_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 30);
BEGIN
  IF length(q) < 2 OR length(q) > 120 OR q ~ '[[:cntrl:]]' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH results AS (
    SELECT base.*
    FROM public.statewide_location_search_without_healthcare(q, bounded_limit) base

    UNION ALL

    SELECT
      'aged_care'::TEXT,
      h.id,
      h.canonical_name,
      h.address,
      h.suburb,
      h.postcode,
      ST_Y(h.location::geometry),
      ST_X(h.location::geometry),
      COALESCE(h.evidence_confidence, 'unknown')::TEXT,
      false,
      (
        CASE
          WHEN lower(h.canonical_name) = q THEN 100
          WHEN lower(h.canonical_name) LIKE q || '%' THEN 80
          WHEN lower(COALESCE(h.postcode, '')) = q THEN 70
          WHEN lower(COALESCE(h.suburb, '')) = q THEN 65
          ELSE 0
        END
        + greatest(
            similarity(lower(h.canonical_name), q),
            similarity(lower(COALESCE(h.address, '')), q),
            similarity(lower(COALESCE(h.suburb, '')), q)
          ) * 25
      )::DOUBLE PRECISION
    FROM public.healthcare_anchors h
    WHERE h.category = 'residential_aged_care'
      AND h.location IS NOT NULL
      AND (
        lower(h.canonical_name) % q
        OR lower(COALESCE(h.address, '')) % q
        OR lower(COALESCE(h.suburb, '')) % q
        OR lower(COALESCE(h.postcode, '')) = q
        OR lower(h.canonical_name) LIKE '%' || q || '%'
        OR lower(COALESCE(h.address, '')) LIKE '%' || q || '%'
      )
  )
  SELECT r.*
  FROM results r
  WHERE r.relevance >= 8
  ORDER BY r.relevance DESC, r.result_name
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.statewide_location_search(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.statewide_location_search(TEXT, INTEGER) TO anon, authenticated;
COMMENT ON FUNCTION public.statewide_location_search(TEXT, INTEGER) IS
  'Bounded parameterised statewide search over canonical public locations, official aged-care anchors and caller organisation records.';

CREATE OR REPLACE FUNCTION public.create_acquisition_business(
  p_trading_name TEXT,
  p_broker_or_source TEXT DEFAULT NULL,
  p_asking_price NUMERIC DEFAULT NULL,
  p_listing_url TEXT DEFAULT NULL,
  p_private_notes TEXT DEFAULT NULL,
  p_pipeline_stage public.pipeline_stage DEFAULT 'watchlist'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  org UUID;
  business_id UUID;
BEGIN
  SELECT current_organisation_id INTO org
  FROM public.profiles
  WHERE id = auth.uid();

  IF auth.uid() IS NULL OR org IS NULL OR NOT public.is_org_member(org) THEN
    RAISE EXCEPTION 'No authorised organisation selected';
  END IF;

  INSERT INTO public.pharmacy_businesses (
    organisation_id, trading_name, broker_or_source, asking_price,
    listing_url, private_notes, created_by
  )
  VALUES (
    org, p_trading_name, p_broker_or_source, p_asking_price,
    p_listing_url, p_private_notes, auth.uid()
  )
  RETURNING id INTO business_id;

  INSERT INTO public.opportunities (
    organisation_id, type, title, business_id, pipeline_stage, created_by
  )
  VALUES (org, 'acquisition', p_trading_name, business_id, p_pipeline_stage, auth.uid());

  RETURN business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_acquisition_business(
  TEXT, TEXT, NUMERIC, TEXT, TEXT, public.pipeline_stage
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_acquisition_business(
  TEXT, TEXT, NUMERIC, TEXT, TEXT, public.pipeline_stage
) TO authenticated;

-- The legacy v1 refresh remains reproducible but no longer scans every pharmacy
-- to find the nearest competitor. NULL now truthfully means none within 10 km.
DO $$
DECLARE
  definition TEXT;
BEGIN
  definition := pg_get_functiondef('public.refresh_dispensing_potential_v1()'::regprocedure);
  IF position(
    'WHERE q.id<>p.id AND q.location IS NOT NULL) nearest_competitor_m'
    IN definition
  ) > 0 THEN
    definition := replace(
      definition,
      'WHERE q.id<>p.id AND q.location IS NOT NULL) nearest_competitor_m',
      'WHERE q.id<>p.id AND q.location IS NOT NULL AND ST_DWithin(q.location,p.location,10000)) nearest_competitor_m'
    );
    EXECUTE definition;
  END IF;
END;
$$;
