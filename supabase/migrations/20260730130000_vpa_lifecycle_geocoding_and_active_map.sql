-- Reversible VPA lifecycle and auditable geocoding.
-- No records are closed or geocoded by applying this migration.

ALTER TABLE public.pharmacy_premises
  ADD COLUMN IF NOT EXISTS vpa_closed_first_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpa_reopened_last_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpa_geocode_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS vpa_pbs_match_state text NOT NULL DEFAULT 'unresolved',
  ADD COLUMN IF NOT EXISTS vpa_official_name text,
  ADD COLUMN IF NOT EXISTS vpa_official_full_address text;

ALTER TABLE public.pharmacy_premises
  DROP CONSTRAINT IF EXISTS pharmacy_premises_vpa_geocode_status_check;
ALTER TABLE public.pharmacy_premises
  ADD CONSTRAINT pharmacy_premises_vpa_geocode_status_check CHECK (
    vpa_geocode_status IN ('existing', 'validated', 'unresolved', 'quarantined', 'not_required')
  );
ALTER TABLE public.pharmacy_premises
  DROP CONSTRAINT IF EXISTS pharmacy_premises_vpa_pbs_match_state_check;
ALTER TABLE public.pharmacy_premises
  ADD CONSTRAINT pharmacy_premises_vpa_pbs_match_state_check CHECK (
    vpa_pbs_match_state IN (
      'vpa_and_pbs_matched', 'vpa_only_pbs_unverified', 'pbs_only_vpa_unmatched',
      'closed_historical', 'source_conflict', 'unresolved'
    )
  );

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_geocode_results (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  staged_premises_id uuid NOT NULL
    REFERENCES public.pharmacy_vpa_staged_premises(id) ON DELETE CASCADE,
  queried_address text NOT NULL,
  normalised_address text NOT NULL,
  provider text NOT NULL,
  provider_result_id text,
  latitude double precision,
  longitude double precision,
  returned_address text,
  returned_suburb text,
  returned_postcode text,
  accuracy_type text,
  confidence numeric,
  validation_state text NOT NULL DEFAULT 'unresolved',
  validation_reasons text[] NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  reviewer_status text NOT NULL DEFAULT 'unreviewed',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  UNIQUE (run_id, staged_premises_id, provider, provider_result_id),
  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1)),
  CHECK (validation_state IN ('validated', 'quarantined', 'unresolved'))
);

ALTER TABLE public.pharmacy_vpa_geocode_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_vpa_geocode_results TO authenticated;
GRANT ALL ON public.pharmacy_vpa_geocode_results TO service_role;
DROP POLICY IF EXISTS pharmacy_vpa_geocode_results_admin
  ON public.pharmacy_vpa_geocode_results;
CREATE POLICY pharmacy_vpa_geocode_results_admin
  ON public.pharmacy_vpa_geocode_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pharmacy_vpa_geocode_results_run_idx
  ON public.pharmacy_vpa_geocode_results (run_id, validation_state);

CREATE OR REPLACE FUNCTION public.apply_vpa_lifecycle_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.vpa_registration_status_normalised = 'closed'
    AND (TG_OP = 'INSERT' OR OLD.vpa_registration_status_normalised IS DISTINCT FROM 'closed')
  THEN
    NEW.vpa_closed_first_observed_at :=
      COALESCE(NEW.vpa_closed_first_observed_at, NEW.vpa_last_observed_at, now());
    NEW.vpa_pbs_match_state := 'closed_historical';
  ELSIF TG_OP = 'UPDATE'
    AND OLD.vpa_registration_status_normalised = 'closed'
    AND NEW.vpa_registration_status_normalised = 'active'
  THEN
    NEW.vpa_reopened_last_observed_at := COALESCE(NEW.vpa_last_observed_at, now());
    IF NEW.vpa_pbs_match_state = 'closed_historical' THEN
      NEW.vpa_pbs_match_state := 'unresolved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_premises_vpa_lifecycle
  ON public.pharmacy_premises;
CREATE TRIGGER trg_pharmacy_premises_vpa_lifecycle
  BEFORE INSERT OR UPDATE OF vpa_registration_status_normalised
  ON public.pharmacy_premises
  FOR EACH ROW EXECUTE FUNCTION public.apply_vpa_lifecycle_state();

CREATE OR REPLACE VIEW public.pharmacy_premises_vpa_lifecycle
WITH (security_invoker = true) AS
SELECT
  p.*,
  CASE
    WHEN p.vpa_registration_status_normalised = 'closed' THEN false
    WHEN p.vpa_registration_status_normalised IN ('active', 'unknown', 'review_required')
      THEN true
    ELSE false
  END AS included_in_default_active_map,
  CASE
    WHEN p.vpa_registration_status_normalised = 'closed' THEN false
    ELSE true
  END AS included_in_active_commercial_competition
FROM public.pharmacy_premises p;

GRANT SELECT ON public.pharmacy_premises_vpa_lifecycle TO anon, authenticated;

COMMENT ON VIEW public.pharmacy_premises_vpa_lifecycle IS
  'Reversible VPA lifecycle projection. Explicitly closed premises remain canonical and historical but are excluded from default active map and commercial competition sets.';

CREATE OR REPLACE FUNCTION public.pharmacy_points_in_viewport(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_missing_data boolean DEFAULT false,
  p_metro_only boolean DEFAULT false,
  p_limit integer DEFAULT 2000
) RETURNS TABLE (
  id uuid, name text, address text, suburb text, postcode text, locality_name text,
  lat double precision, lng double precision,
  vpa_registration_status public.verification_status,
  premises_source public.premises_source_type, source_confidence text,
  geocode_method text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF p_west < 140 OR p_east > 150 OR p_south < -40 OR p_north > -33
     OR p_west >= p_east OR p_south >= p_north THEN
    RAISE EXCEPTION 'Invalid Victorian viewport';
  END IF;
  IF p_limit < 1 OR p_limit > 2000 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  RETURN QUERY
  WITH matches AS (
    SELECT p.*
    FROM public.pharmacy_premises p
    WHERE p.location IS NOT NULL
      AND p.vpa_registration_status_normalised <> 'closed'
      AND p.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
      AND (NOT p_metro_only OR EXISTS (
        SELECT 1 FROM public.dispensing_population_areas a
        WHERE a.peer_group = 'metropolitan'
          AND ST_Intersects(a.boundary, p.location::geometry)
      ))
      AND (NOT p_missing_data OR p.geocode_method = 'suburb_centroid'
        OR p.source_confidence = 'approximate'
        OR (p.phone IS NULL AND p.website IS NULL))
  ), counted AS (
    SELECT m.*, count(*) OVER () AS total FROM matches m
  ), sampled AS (
    SELECT c.* FROM counted c
    ORDER BY CASE WHEN c.total > p_limit THEN hashtext(c.id::text) END NULLS FIRST,
      c.name, c.id
    LIMIT p_limit
  )
  SELECT s.id, s.name, s.address, s.suburb, s.postcode, s.locality_name,
    ST_Y(s.location::geometry), ST_X(s.location::geometry),
    s.vpa_registration_status, s.premises_source, s.source_confidence,
    s.geocode_method, s.total
  FROM sampled s ORDER BY s.name, s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.pharmacy_points_in_viewport(
  double precision, double precision, double precision, double precision,
  boolean, boolean, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmacy_points_in_viewport(
  double precision, double precision, double precision, double precision,
  boolean, boolean, integer
) TO anon, authenticated;
