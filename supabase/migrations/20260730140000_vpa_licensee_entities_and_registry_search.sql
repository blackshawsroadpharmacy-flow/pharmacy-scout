-- Canonical published-licensee identities and bounded registry search.
-- Published names are descriptive register entities, not beneficial owners.

CREATE OR REPLACE VIEW public.pharmacy_premises_geo
WITH (security_invoker = true) AS
SELECT
  p.id, p.name, p.address, p.suburb, p.postcode, p.locality_name,
  ST_Y(p.location::geometry) AS lat,
  ST_X(p.location::geometry) AS lng,
  ST_Y(p.public_door_location::geometry) AS door_lat,
  ST_X(p.public_door_location::geometry) AS door_lng,
  p.door_source, p.door_confidence, p.door_verified_at,
  p.vpa_registration_status, p.vpa_registration_checked_at,
  p.premises_source, p.source_confidence, p.source_id, p.phone, p.website,
  p.geocode_method, p.notes, p.created_at, p.updated_at,
  p.vpa_official_name, p.vpa_official_full_address,
  p.vpa_registration_status_raw, p.vpa_registration_status_normalised,
  p.vpa_registered_until, p.vpa_premises_conditions_raw,
  p.vpa_source_verification_status, p.vpa_first_observed_at,
  p.vpa_last_observed_at, p.vpa_snapshot_reference_date,
  p.vpa_match_status, p.vpa_match_confidence, p.vpa_review_status,
  p.vpa_pbs_match_state, p.vpa_geocode_status
FROM public.pharmacy_premises p;

GRANT SELECT ON public.pharmacy_premises_geo TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.vpa_published_licensees (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  normalised_comparison_name text NOT NULL UNIQUE,
  published_display_name text NOT NULL,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  possible_duplicate_review_status text NOT NULL DEFAULT 'unreviewed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vpa_published_licensee_relationships (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  published_licensee_id uuid NOT NULL
    REFERENCES public.vpa_published_licensees(id) ON DELETE RESTRICT,
  premises_licensee_id uuid NOT NULL
    REFERENCES public.pharmacy_premises_licensees(id) ON DELETE CASCADE,
  premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  currently_observed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (published_licensee_id, premises_licensee_id)
);

ALTER TABLE public.vpa_published_licensees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpa_published_licensee_relationships ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.vpa_published_licensees, public.vpa_published_licensee_relationships
  TO authenticated;
GRANT ALL ON public.vpa_published_licensees, public.vpa_published_licensee_relationships
  TO service_role;
DROP POLICY IF EXISTS vpa_published_licensees_read
  ON public.vpa_published_licensees;
CREATE POLICY vpa_published_licensees_read
  ON public.vpa_published_licensees FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS vpa_published_licensee_relationships_read
  ON public.vpa_published_licensee_relationships;
CREATE POLICY vpa_published_licensee_relationships_read
  ON public.vpa_published_licensee_relationships FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS vpa_published_licensees_name_trgm_idx
  ON public.vpa_published_licensees
  USING gin (normalised_comparison_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vpa_published_licensee_relationships_current_idx
  ON public.vpa_published_licensee_relationships
  (published_licensee_id, currently_observed, premises_id);

CREATE OR REPLACE FUNCTION public.normalise_vpa_published_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT trim(regexp_replace(lower(COALESCE(p_name, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.sync_vpa_published_licensee_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  entity_id uuid;
  comparison_name text := public.normalise_vpa_published_name(NEW.licensee_name);
BEGIN
  IF comparison_name = '' THEN RETURN NEW; END IF;
  INSERT INTO public.vpa_published_licensees (
    normalised_comparison_name, published_display_name, first_observed_at, last_observed_at
  ) VALUES (
    comparison_name, NEW.licensee_name,
    COALESCE(NEW.first_observed_at, NEW.last_seen_at),
    NEW.last_seen_at
  )
  ON CONFLICT (normalised_comparison_name) DO UPDATE
    SET published_display_name = EXCLUDED.published_display_name,
        first_observed_at = LEAST(
          public.vpa_published_licensees.first_observed_at,
          EXCLUDED.first_observed_at
        ),
        last_observed_at = GREATEST(
          public.vpa_published_licensees.last_observed_at,
          EXCLUDED.last_observed_at
        ),
        updated_at = now()
  RETURNING id INTO entity_id;

  INSERT INTO public.vpa_published_licensee_relationships (
    published_licensee_id, premises_licensee_id, premises_id,
    first_observed_at, last_observed_at, currently_observed
  ) VALUES (
    entity_id, NEW.id, NEW.premises_id,
    COALESCE(NEW.first_observed_at, NEW.last_seen_at),
    NEW.last_seen_at, NEW.currently_observed
  )
  ON CONFLICT (published_licensee_id, premises_licensee_id) DO UPDATE
    SET premises_id = EXCLUDED.premises_id,
        first_observed_at = LEAST(
          public.vpa_published_licensee_relationships.first_observed_at,
          EXCLUDED.first_observed_at
        ),
        last_observed_at = EXCLUDED.last_observed_at,
        currently_observed = EXCLUDED.currently_observed;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vpa_published_licensee_entity
  ON public.pharmacy_premises_licensees;
CREATE TRIGGER trg_sync_vpa_published_licensee_entity
  AFTER INSERT OR UPDATE OF licensee_name, premises_id, first_observed_at,
    last_seen_at, currently_observed
  ON public.pharmacy_premises_licensees
  FOR EACH ROW EXECUTE FUNCTION public.sync_vpa_published_licensee_entity();

CREATE OR REPLACE VIEW public.vpa_published_licensee_networks
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.published_display_name,
  l.normalised_comparison_name,
  l.first_observed_at,
  l.last_observed_at,
  l.possible_duplicate_review_status,
  count(DISTINCT r.premises_id) FILTER (WHERE r.currently_observed) AS current_premises_count,
  count(DISTINCT r.premises_id) AS historical_premises_count,
  array_remove(array_agg(DISTINCT p.suburb), NULL) AS suburbs,
  array_agg(DISTINCT r.premises_id) FILTER (WHERE r.currently_observed) AS active_premises_ids
FROM public.vpa_published_licensees l
LEFT JOIN public.vpa_published_licensee_relationships r
  ON r.published_licensee_id = l.id
LEFT JOIN public.pharmacy_premises p ON p.id = r.premises_id
GROUP BY l.id;

GRANT SELECT ON public.vpa_published_licensee_networks TO authenticated;

CREATE OR REPLACE FUNCTION public.vpa_registry_search(
  p_query text,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 24
) RETURNS TABLE (
  result_type text,
  result_id uuid,
  result_name text,
  result_address text,
  result_suburb text,
  result_postcode text,
  lat double precision,
  lng double precision,
  source_confidence text,
  relevance double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  q text := lower(trim(COALESCE(p_query, '')));
  bounded_limit integer := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50);
  bounded_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
BEGIN
  IF length(q) < 2 OR length(q) > 120 OR q ~ '[[:cntrl:]]' THEN RETURN; END IF;
  RETURN QUERY
  WITH matches AS (
    SELECT
      'vpa_pharmacy'::text, p.id,
      COALESCE(p.vpa_official_name, p.name),
      COALESCE(p.vpa_official_full_address, p.address),
      p.suburb, p.postcode,
      ST_Y(p.location::geometry), ST_X(p.location::geometry),
      p.vpa_source_verification_status,
      greatest(
        similarity(lower(COALESCE(p.vpa_official_name, p.name)), q),
        similarity(lower(COALESCE(p.vpa_official_full_address, p.address)), q)
      )::double precision
    FROM public.pharmacy_premises p
    WHERE p.vpa_record_key IS NOT NULL
      AND (
        lower(COALESCE(p.vpa_official_name, p.name)) % q
        OR lower(COALESCE(p.vpa_official_full_address, p.address)) % q
        OR lower(COALESCE(p.postcode, '')) = q
      )
    UNION ALL
    SELECT
      'registered_licensee', l.id, l.published_display_name,
      'Published VPA registered licensee'::text, NULL::text, NULL::text,
      NULL::double precision, NULL::double precision,
      'authoritative_source'::text,
      similarity(l.normalised_comparison_name, public.normalise_vpa_published_name(q))
    FROM public.vpa_published_licensees l
    WHERE l.normalised_comparison_name % public.normalise_vpa_published_name(q)
  )
  SELECT * FROM matches
  ORDER BY relevance DESC, result_name, result_id
  OFFSET bounded_offset LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.vpa_registry_search(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vpa_registry_search(text, integer, integer) TO authenticated;

COMMENT ON TABLE public.vpa_published_licensees IS
  'Canonical exact published VPA licensee identities. These entities do not establish ownership, family relationship, corporate control, banner affiliation, or beneficial ownership.';
