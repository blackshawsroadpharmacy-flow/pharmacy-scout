CREATE OR REPLACE FUNCTION public.pharmacy_points_in_viewport(
  p_west DOUBLE PRECISION,
  p_south DOUBLE PRECISION,
  p_east DOUBLE PRECISION,
  p_north DOUBLE PRECISION,
  p_missing_data BOOLEAN DEFAULT false,
  p_metro_only BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 2000
) RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  suburb TEXT,
  postcode TEXT,
  locality_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  vpa_registration_status public.verification_status,
  premises_source public.premises_source_type,
  source_confidence TEXT,
  geocode_method TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_west < 140 OR p_east > 150 OR p_south < -40 OR p_north > -33
     OR p_west >= p_east OR p_south >= p_north THEN
    RAISE EXCEPTION 'Invalid Victorian viewport';
  END IF;
  IF p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT p.*
    FROM public.pharmacy_premises p
    WHERE p.location IS NOT NULL
      AND p.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
      AND (
        NOT p_metro_only
        OR p.location && ST_MakeEnvelope(144.5, -38.5, 145.6, -37.4, 4326)::geography
      )
      AND (
        NOT p_missing_data
        OR p.phone IS NULL
        OR p.website IS NULL
        OR p.source_confidence = 'approximate'
        OR p.geocode_method = 'suburb_centroid'
      )
  )
  SELECT
    p.id,
    p.name,
    p.address,
    p.suburb,
    p.postcode,
    p.locality_name,
    ST_Y(p.location::geometry),
    ST_X(p.location::geometry),
    p.vpa_registration_status,
    p.premises_source,
    p.source_confidence,
    p.geocode_method,
    count(*) OVER ()
  FROM matches p
  ORDER BY p.name, p.id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.pharmacy_points_in_viewport(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  BOOLEAN, BOOLEAN, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.pharmacy_points_in_viewport(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  BOOLEAN, BOOLEAN, INTEGER
) TO anon, authenticated;

COMMENT ON FUNCTION public.pharmacy_points_in_viewport(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  BOOLEAN, BOOLEAN, INTEGER
) IS 'Lightweight, indexed map/list query. Returns only pharmacy discovery records within the current Victorian viewport; regulatory status remains unknown unless sourced separately.';

CREATE OR REPLACE FUNCTION public.external_points_in_viewport_v2(
  p_category TEXT,
  p_west DOUBLE PRECISION,
  p_south DOUBLE PRECISION,
  p_east DOUBLE PRECISION,
  p_north DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 2000
) RETURNS TABLE (
  id UUID,
  category TEXT,
  name TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  verification_status TEXT,
  coordinate_confidence NUMERIC,
  source_name TEXT,
  source_url TEXT,
  fetched_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_west < 140 OR p_east > 150 OR p_south < -40 OR p_north > -33
     OR p_west >= p_east OR p_south >= p_north THEN
    RAISE EXCEPTION 'Invalid Victorian viewport';
  END IF;
  IF p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;

  IF p_category = 'supermarkets' THEN
    RETURN QUERY
    WITH matches AS (
      SELECT s.*, r.name AS registry_name
      FROM public.supermarkets s
      JOIN public.external_source_registry r ON r.id = s.source_id
      WHERE s.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
    )
    SELECT s.id, 'supermarkets'::TEXT, s.name, s.address,
      ST_Y(s.location::geometry), ST_X(s.location::geometry),
      s.verification_status::TEXT, s.coordinate_confidence, s.registry_name,
      s.source_url, s.fetched_at, count(*) OVER ()
    FROM matches s
    ORDER BY s.name, s.id
    LIMIT p_limit;
  ELSIF p_category = 'medical_centres' THEN
    RETURN QUERY
    WITH matches AS (
      SELECT m.*, r.name AS registry_name
      FROM public.medical_centres m
      JOIN public.external_source_registry r ON r.id = m.source_id
      WHERE m.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
    )
    SELECT m.id, 'medical_centres'::TEXT, m.name, m.address,
      ST_Y(m.location::geometry), ST_X(m.location::geometry),
      m.verification_status::TEXT, m.coordinate_confidence, m.registry_name,
      m.source_url, m.fetched_at, count(*) OVER ()
    FROM matches m
    ORDER BY m.name, m.id
    LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'Unsupported category';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.external_points_in_viewport_v2(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.external_points_in_viewport_v2(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) TO anon, authenticated;
