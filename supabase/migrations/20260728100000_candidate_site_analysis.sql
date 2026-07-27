-- Candidate-site distance functions are a commercial preliminary-assessment path.
-- They calculate point-to-point geography distance from sourced display coordinates.
-- They are not statutory measurement functions and must never be called by a final
-- Pharmacy Location Rules determination.

CREATE OR REPLACE FUNCTION public.candidate_nearest_pharmacy(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_confirmed_only BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 1
) RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  calculated_point_distance_m DOUBLE PRECISION,
  distance_usable BOOLEAN,
  confirmation_basis TEXT,
  coordinate_quality TEXT,
  verification_status TEXT,
  source_name TEXT,
  source_url TEXT,
  evidence_fetched_at TIMESTAMPTZ,
  unresolved_duplicate_candidates BIGINT,
  warnings TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lng < 140.96 OR p_lng > 149.98 OR p_lat < -39.2 OR p_lat > -33.98 THEN
    RAISE EXCEPTION 'Candidate location is outside Victorian operating bounds';
  END IF;
  IF p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;

  RETURN QUERY
  WITH point AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
  ),
  candidates AS (
    SELECT
      p.*,
      sr.source_name,
      sr.source_url,
      sr.fetched_at,
      (
        p.vpa_registration_status = 'verified'
        OR EXISTS (
          SELECT 1 FROM public.pbs_approvals a
          WHERE a.premises_id = p.id AND a.approval_status = 'verified'
        )
      ) AS is_confirmed,
      (
        p.source_confidence = 'approximate'
        OR p.geocode_method = 'suburb_centroid'
        OR p.vpa_registration_status = 'conflict'
      ) AS coordinate_uncertain
    FROM public.pharmacy_premises p
    LEFT JOIN public.source_records sr ON sr.id = p.source_id
    WHERE p.location IS NOT NULL
  )
  SELECT
    c.id,
    c.name,
    c.address,
    ST_Y(c.location::geometry),
    ST_X(c.location::geometry),
    ST_Distance(c.location, point.g),
    NOT c.coordinate_uncertain,
    CASE WHEN c.is_confirmed
      THEN 'verified VPA registration or verified PBS approval'
      ELSE 'discovery record only'
    END,
    CASE WHEN c.coordinate_uncertain THEN 'approximate_or_conflicting' ELSE 'sourced_point' END,
    c.vpa_registration_status::TEXT,
    c.source_name,
    c.source_url,
    c.fetched_at,
    (
      SELECT count(*)
      FROM public.pharmacy_premises d
      WHERE d.id <> c.id
        AND (
          lower(trim(d.address)) = lower(trim(c.address))
          OR (
            lower(trim(d.name)) = lower(trim(c.name))
            AND d.location IS NOT NULL
            AND ST_DWithin(d.location, c.location, 50)
          )
        )
    ),
    array_remove(ARRAY[
      CASE WHEN c.coordinate_uncertain
        THEN 'Coordinate is approximate or conflicting; professional measurement required' END,
      CASE WHEN NOT c.is_confirmed
        THEN 'Discovery evidence is not confirmed regulatory evidence' END,
      CASE WHEN c.fetched_at IS NULL
        THEN 'Evidence date unavailable'
        WHEN c.fetched_at < now() - interval '365 days'
        THEN 'Source evidence is stale' END
    ], NULL)
  FROM candidates c, point
  WHERE NOT p_confirmed_only OR c.is_confirmed
  ORDER BY c.location <-> point.g, c.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.candidate_pharmacies_within_radius(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INTEGER
) RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  calculated_point_distance_m DOUBLE PRECISION,
  coordinate_quality TEXT,
  verification_status TEXT,
  source_name TEXT,
  source_url TEXT,
  evidence_fetched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lng < 140.96 OR p_lng > 149.98 OR p_lat < -39.2 OR p_lat > -33.98 THEN
    RAISE EXCEPTION 'Candidate location is outside Victorian operating bounds';
  END IF;
  IF p_radius_m < 100 OR p_radius_m > 20000 THEN
    RAISE EXCEPTION 'Radius must be between 100 and 20000 metres';
  END IF;

  RETURN QUERY
  WITH point AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
  )
  SELECT
    p.id, p.name, p.address,
    ST_Y(p.location::geometry), ST_X(p.location::geometry),
    ST_Distance(p.location, point.g),
    CASE
      WHEN p.source_confidence = 'approximate'
        OR p.geocode_method = 'suburb_centroid'
        OR p.vpa_registration_status = 'conflict'
      THEN 'approximate_or_conflicting'
      ELSE 'sourced_point'
    END,
    p.vpa_registration_status::TEXT,
    sr.source_name, sr.source_url, sr.fetched_at
  FROM public.pharmacy_premises p
  LEFT JOIN public.source_records sr ON sr.id = p.source_id
  CROSS JOIN point
  WHERE p.location IS NOT NULL AND ST_DWithin(p.location, point.g, p_radius_m)
  ORDER BY p.location <-> point.g, p.id
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.candidate_external_within_500m(
  p_category TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
) RETURNS TABLE (
  id UUID,
  category TEXT,
  name TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  calculated_point_distance_m DOUBLE PRECISION,
  coordinate_confidence NUMERIC,
  coordinate_method TEXT,
  verification_status TEXT,
  source_name TEXT,
  source_url TEXT,
  evidence_fetched_at TIMESTAMPTZ,
  unresolved_conflicts BIGINT,
  warnings TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lng < 140.96 OR p_lng > 149.98 OR p_lat < -39.2 OR p_lat > -33.98 THEN
    RAISE EXCEPTION 'Candidate location is outside Victorian operating bounds';
  END IF;
  IF p_category NOT IN ('supermarkets', 'medical_centres') THEN
    RAISE EXCEPTION 'Unsupported category';
  END IF;

  IF p_category = 'supermarkets' THEN
    RETURN QUERY
    WITH point AS (
      SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
    )
    SELECT s.id, 'supermarkets'::TEXT, s.name, s.address,
      ST_Y(s.location::geometry), ST_X(s.location::geometry),
      ST_Distance(s.location, point.g), s.coordinate_confidence, s.coordinate_method,
      s.verification_status::TEXT, r.name, s.source_url, s.fetched_at,
      (SELECT count(*) FROM public.external_entity_conflicts c
       WHERE c.category = 'supermarkets' AND c.entity_id = s.id AND c.status = 'unresolved'),
      array_remove(ARRAY[
        CASE WHEN s.coordinate_confidence < 0.8 OR s.coordinate_method <> 'source_point'
          THEN 'Coordinate is not a confirmed public entrance' END,
        CASE WHEN s.verification_status = 'conflicting'
          THEN 'Unresolved source conflict' END,
        CASE WHEN s.fetched_at < now() - interval '180 days'
          THEN 'Source evidence is stale' END,
        'Floor area is unknown unless separately sourced'
      ], NULL)
    FROM public.supermarkets s
    JOIN public.external_source_registry r ON r.id = s.source_id
    CROSS JOIN point
    WHERE ST_DWithin(s.location, point.g, 500)
    ORDER BY s.location <-> point.g, s.id;
  ELSE
    RETURN QUERY
    WITH point AS (
      SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g
    )
    SELECT m.id, 'medical_centres'::TEXT, m.name, m.address,
      ST_Y(m.location::geometry), ST_X(m.location::geometry),
      ST_Distance(m.location, point.g), m.coordinate_confidence, m.coordinate_method,
      m.verification_status::TEXT, r.name, m.source_url, m.fetched_at,
      (SELECT count(*) FROM public.external_entity_conflicts c
       WHERE c.category = 'medical_centres' AND c.entity_id = m.id AND c.status = 'unresolved'),
      array_remove(ARRAY[
        CASE WHEN m.coordinate_confidence < 0.8 OR m.coordinate_method <> 'source_point'
          THEN 'Coordinate is not a confirmed public entrance' END,
        CASE WHEN m.verification_status = 'conflicting'
          THEN 'Unresolved source conflict' END,
        CASE WHEN m.fetched_at < now() - interval '180 days'
          THEN 'Source evidence is stale' END,
        'Practitioner FTE and PBS prescriber counts are unknown unless separately sourced'
      ], NULL)
    FROM public.medical_centres m
    JOIN public.external_source_registry r ON r.id = m.source_id
    CROSS JOIN point
    WHERE ST_DWithin(m.location, point.g, 500)
    ORDER BY m.location <-> point.g, m.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.candidate_site_analysis(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_m INTEGER DEFAULT 1500
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  confirmed JSONB;
  conservative JSONB;
  pharmacies JSONB;
  supermarkets JSONB;
  medical_centres JSONB;
  assessment_label TEXT;
BEGIN
  IF p_lng < 140.96 OR p_lng > 149.98 OR p_lat < -39.2 OR p_lat > -33.98 THEN
    RAISE EXCEPTION 'Candidate location is outside Victorian operating bounds';
  END IF;
  IF p_radius_m < 100 OR p_radius_m > 20000 THEN
    RAISE EXCEPTION 'Radius must be between 100 and 20000 metres';
  END IF;

  SELECT to_jsonb(x) INTO confirmed
  FROM public.candidate_nearest_pharmacy(p_lat, p_lng, true, 1) x;
  SELECT to_jsonb(x) INTO conservative
  FROM public.candidate_nearest_pharmacy(p_lat, p_lng, false, 1) x;
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO pharmacies
  FROM public.candidate_pharmacies_within_radius(p_lat, p_lng, p_radius_m) x;
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO supermarkets
  FROM public.candidate_external_within_500m('supermarkets', p_lat, p_lng) x;
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO medical_centres
  FROM public.candidate_external_within_500m('medical_centres', p_lat, p_lng) x;

  assessment_label := CASE
    WHEN confirmed IS NULL THEN 'source coverage incomplete'
    WHEN conservative IS NULL THEN 'insufficient evidence'
    WHEN COALESCE((conservative->>'distance_usable')::BOOLEAN, false) = false
      THEN 'professional measurement required'
    ELSE 'insufficient evidence'
  END;

  result := jsonb_build_object(
    'candidate', jsonb_build_object('lat', p_lat, 'lng', p_lng),
    'radius_m', p_radius_m,
    'generated_at', now(),
    'assessment_label', assessment_label,
    'nearest_confirmed_pharmacy', confirmed,
    'nearest_conservative_pharmacy', conservative,
    'pharmacies_within_radius', pharmacies,
    'supermarkets_within_500m', supermarkets,
    'medical_centres_within_500m', medical_centres,
    'source_coverage', jsonb_build_object(
      'pharmacies', CASE WHEN confirmed IS NULL
        THEN 'No verified VPA/PBS coverage; discovery records only'
        ELSE 'At least one verified regulatory pharmacy record available' END,
      'supermarkets', 'OpenStreetMap discovery coverage varies; absence is not evidence of none',
      'medical_centres', 'OpenStreetMap discovery coverage varies; absence is not evidence of none',
      'population', 'ABS SA2 2024 ERP and 2023-24 annual change; contextual area evidence'
    ),
    'required_caveats', jsonb_build_array(
      'Preliminary assessment only; not legal advice or a final Pharmacy Location Rule determination',
      'Calculated distances use sourced display coordinates, not professionally surveyed public-door points',
      'Supermarket floor area is not inferred',
      'General-practitioner FTE and PBS prescriber counts are not inferred',
      'Legal eligibility and regulatory compliance are not inferred from proximity or population context'
    )
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_nearest_pharmacy(
  DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.candidate_pharmacies_within_radius(
  DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.candidate_external_within_500m(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.candidate_site_analysis(
  DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.candidate_nearest_pharmacy(
  DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, INTEGER
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_pharmacies_within_radius(
  DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_external_within_500m(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_site_analysis(
  DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) TO anon, authenticated;

COMMENT ON FUNCTION public.candidate_site_analysis(
  DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) IS 'Commercial preliminary candidate-site evidence. Point distances are server-calculated from sourced display coordinates. Not a statutory measurement or legal determination.';
