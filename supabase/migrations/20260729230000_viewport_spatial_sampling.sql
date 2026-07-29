-- Audit remediation F-03, F-23h, F-23i.
--
-- F-03  The viewport RPC ordered by name and truncated at p_limit, so a wide
--       Melbourne view (721 matches, 500 returned) dropped every pharmacy
--       sorting after "Pharmacy 777…" — an entire alphabetical tail including
--       a major national banner. Truncation is now spatially even.
-- F-23h "Metropolitan Melbourne only" used a hard-coded rectangle; it now uses
--       the ABS peer_group already imported for each SA2.
-- F-23i "Only missing contact/geocode data" matched website IS NULL, true for
--       most records, making the filter useless as triage.

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
        OR EXISTS (
          SELECT 1 FROM public.dispensing_population_areas a
          WHERE a.peer_group = 'metropolitan'
            AND ST_Intersects(a.boundary, p.location::geometry)
        )
      )
      AND (
        NOT p_missing_data
        -- Genuine data-quality gaps only. A missing website is the norm and
        -- previously matched almost every record.
        OR p.location IS NULL
        OR p.geocode_method = 'suburb_centroid'
        OR p.source_confidence = 'approximate'
        OR (p.phone IS NULL AND p.website IS NULL)
      )
  ), counted AS (
    SELECT m.*, count(*) OVER () AS total
    FROM matches m
  ), sampled AS (
    -- When the viewport holds more than p_limit matches, spread the returned
    -- subset across the extent instead of taking an alphabetical prefix.
    -- Ordering by a hash of the id is stable per pharmacy and uncorrelated
    -- with both name and position, so the sample stays spatially even and
    -- does not flicker between identical requests.
    SELECT c.*
    FROM counted c
    ORDER BY
      CASE WHEN c.total > p_limit THEN hashtext(c.id::TEXT) END NULLS FIRST,
      c.name,
      c.id
    LIMIT p_limit
  )
  SELECT
    s.id,
    s.name,
    s.address,
    s.suburb,
    s.postcode,
    s.locality_name,
    ST_Y(s.location::geometry),
    ST_X(s.location::geometry),
    s.vpa_registration_status,
    s.premises_source,
    s.source_confidence,
    s.geocode_method,
    s.total
  FROM sampled s
  ORDER BY s.name, s.id;
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
) IS 'Viewport pharmacy discovery records. When total_count exceeds the limit the returned subset is sampled spatially, never alphabetically; callers must surface total_count.';
