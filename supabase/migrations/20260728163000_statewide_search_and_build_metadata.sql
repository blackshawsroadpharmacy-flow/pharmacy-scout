CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS ix_pharmacy_premises_search_name_trgm
  ON public.pharmacy_premises USING GIN (lower(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_pharmacy_premises_search_address_trgm
  ON public.pharmacy_premises USING GIN (lower(address) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_pharmacy_premises_search_suburb_trgm
  ON public.pharmacy_premises USING GIN (lower(COALESCE(suburb, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_supermarkets_search_name_trgm
  ON public.supermarkets USING GIN (lower(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_supermarkets_search_address_trgm
  ON public.supermarkets USING GIN (lower(COALESCE(address, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_medical_centres_search_name_trgm
  ON public.medical_centres USING GIN (lower(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_medical_centres_search_address_trgm
  ON public.medical_centres USING GIN (lower(COALESCE(address, '')) extensions.gin_trgm_ops);

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
  WITH public_results AS (
    SELECT
      'pharmacy'::TEXT AS result_type,
      p.id AS result_id,
      p.name AS result_name,
      p.address AS result_address,
      p.suburb AS result_suburb,
      p.postcode AS result_postcode,
      ST_Y(p.location::geometry) AS lat,
      ST_X(p.location::geometry) AS lng,
      COALESCE(p.source_confidence, 'unknown')::TEXT AS source_confidence,
      false AS is_private,
      (
        CASE
          WHEN lower(p.name) = q THEN 100
          WHEN lower(p.name) LIKE q || '%' THEN 80
          WHEN lower(COALESCE(p.postcode, '')) = q THEN 70
          WHEN lower(COALESCE(p.suburb, '')) = q THEN 65
          ELSE 0
        END
        + greatest(
            similarity(lower(p.name), q),
            similarity(lower(p.address), q),
            similarity(lower(COALESCE(p.suburb, '')), q)
          ) * 25
      )::DOUBLE PRECISION AS relevance
    FROM public.pharmacy_premises p
    WHERE p.location IS NOT NULL
      AND (
        lower(p.name) % q
        OR lower(p.address) % q
        OR lower(COALESCE(p.suburb, '')) % q
        OR lower(COALESCE(p.postcode, '')) = q
        OR lower(p.name) LIKE '%' || q || '%'
        OR lower(p.address) LIKE '%' || q || '%'
      )

    UNION ALL

    SELECT
      'supermarket', s.id, s.name, s.address, NULL, NULL,
      ST_Y(s.location::geometry), ST_X(s.location::geometry),
      CASE
        WHEN s.verification_status IN ('confirmed', 'probable') THEN s.verification_status::TEXT
        ELSE 'discovery'
      END,
      false,
      (
        CASE
          WHEN lower(s.name) = q THEN 100
          WHEN lower(s.name) LIKE q || '%' THEN 80
          ELSE 0
        END
        + greatest(
            similarity(lower(s.name), q),
            similarity(lower(COALESCE(s.address, '')), q)
          ) * 25
      )::DOUBLE PRECISION
    FROM public.supermarkets s
    WHERE lower(s.name) % q
       OR lower(COALESCE(s.address, '')) % q
       OR lower(s.name) LIKE '%' || q || '%'
       OR lower(COALESCE(s.address, '')) LIKE '%' || q || '%'

    UNION ALL

    SELECT
      'medical_centre', m.id, m.name, m.address, NULL, NULL,
      ST_Y(m.location::geometry), ST_X(m.location::geometry),
      CASE
        WHEN m.verification_status IN ('confirmed', 'probable') THEN m.verification_status::TEXT
        ELSE 'discovery'
      END,
      false,
      (
        CASE
          WHEN lower(m.name) = q THEN 100
          WHEN lower(m.name) LIKE q || '%' THEN 80
          ELSE 0
        END
        + greatest(
            similarity(lower(m.name), q),
            similarity(lower(COALESCE(m.address, '')), q)
          ) * 25
      )::DOUBLE PRECISION
    FROM public.medical_centres m
    WHERE lower(m.name) % q
       OR lower(COALESCE(m.address, '')) % q
       OR lower(m.name) LIKE '%' || q || '%'
       OR lower(COALESCE(m.address, '')) LIKE '%' || q || '%'
  ),
  private_results AS (
    SELECT
      'acquisition_opportunity'::TEXT,
      o.id,
      COALESCE(b.trading_name, o.title),
      p.address,
      p.suburb,
      p.postcode,
      ST_Y(p.location::geometry),
      ST_X(p.location::geometry),
      'private organisation record'::TEXT,
      true,
      (
        CASE WHEN lower(COALESCE(b.trading_name, o.title)) = q THEN 100 ELSE 0 END
        + greatest(
            similarity(lower(COALESCE(b.trading_name, o.title)), q),
            similarity(lower(COALESCE(p.address, '')), q)
          ) * 25
      )::DOUBLE PRECISION
    FROM public.opportunities o
    LEFT JOIN public.pharmacy_businesses b ON b.id = o.business_id
    LEFT JOIN public.pharmacy_premises p ON p.id = b.premises_id
    WHERE auth.uid() IS NOT NULL
      AND public.is_org_member(o.organisation_id)
      AND o.type = 'acquisition'
      AND (
        lower(COALESCE(b.trading_name, o.title)) % q
        OR lower(COALESCE(p.address, '')) % q
        OR lower(COALESCE(b.trading_name, o.title)) LIKE '%' || q || '%'
      )

    UNION ALL

    SELECT
      'candidate_site', c.id, c.label, c.address, NULL, NULL,
      ST_Y(c.location::geometry), ST_X(c.location::geometry),
      'private organisation record', true,
      (
        CASE WHEN lower(c.label) = q THEN 100 ELSE 0 END
        + greatest(
            similarity(lower(c.label), q),
            similarity(lower(COALESCE(c.address, '')), q)
          ) * 25
      )::DOUBLE PRECISION
    FROM public.candidate_sites c
    WHERE auth.uid() IS NOT NULL
      AND public.is_org_member(c.organisation_id)
      AND c.location IS NOT NULL
      AND (
        lower(c.label) % q
        OR lower(COALESCE(c.address, '')) % q
        OR lower(c.label) LIKE '%' || q || '%'
      )
  )
  SELECT r.*
  FROM (
    SELECT * FROM public_results
    UNION ALL
    SELECT * FROM private_results
  ) r
  WHERE r.relevance >= 8
  ORDER BY r.relevance DESC, r.result_name
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.statewide_location_search(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.statewide_location_search(TEXT, INTEGER) TO anon, authenticated;
COMMENT ON FUNCTION public.statewide_location_search(TEXT, INTEGER) IS
  'Bounded statewide search over canonical public locations plus caller organisation records. Raw import tables are never exposed.';

CREATE OR REPLACE FUNCTION public.public_data_freshness()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'latest_pharmacy_import', (SELECT max(fetched_at) FROM public.source_records WHERE source_kind IN ('healthdirect', 'osm')),
    'latest_supermarket_import', (SELECT max(fetched_at) FROM public.supermarkets),
    'latest_medical_centre_import', (SELECT max(fetched_at) FROM public.medical_centres),
    'abs_reference_period', '2024 ERP; 2023–24 annual growth',
    'schema_version', '20260728163000'
  );
$$;

REVOKE ALL ON FUNCTION public.public_data_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_data_freshness() TO anon, authenticated;
