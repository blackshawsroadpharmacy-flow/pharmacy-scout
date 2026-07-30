-- Security and integrity hardening following independent review of the final VPA stack.
-- Additive only: no source import, canonical promotion, geocoding, alert generation,
-- or GDP recomputation occurs when this migration is applied.

-- ---------------------------------------------------------------------------
-- Private alerts: members can read their organisation's alerts and acknowledge
-- them by setting read_at. System-generated alert content is never client-writable.
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.vpa_private_alerts FROM authenticated;
GRANT SELECT ON public.vpa_private_alerts TO authenticated;
GRANT UPDATE (read_at) ON public.vpa_private_alerts TO authenticated;

DROP POLICY IF EXISTS vpa_private_alerts_org_members ON public.vpa_private_alerts;
DROP POLICY IF EXISTS vpa_private_alerts_org_select ON public.vpa_private_alerts;
DROP POLICY IF EXISTS vpa_private_alerts_org_acknowledge ON public.vpa_private_alerts;

CREATE POLICY vpa_private_alerts_org_select
  ON public.vpa_private_alerts FOR SELECT TO authenticated
  USING (public.is_org_member(organisation_id));

CREATE POLICY vpa_private_alerts_org_acknowledge
  ON public.vpa_private_alerts FOR UPDATE TO authenticated
  USING (public.is_org_member(organisation_id))
  WITH CHECK (public.is_org_member(organisation_id));

REVOKE ALL ON FUNCTION public.capture_vpa_premises_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_vpa_licensee_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_private_vpa_alert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_private_vpa_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A closed/reopened event is the actionable lifecycle event. Its derived
  -- closed_historical PBS/VPA state change must not create a duplicate alert.
  IF NEW.event_type = 'vpa_pbs_match_change'
    AND NEW.new_value = to_jsonb('closed_historical'::text)
    AND EXISTS (
      SELECT 1
      FROM public.pharmacy_vpa_change_events AS lifecycle_event
      WHERE lifecycle_event.run_id = NEW.run_id
        AND lifecycle_event.premises_id = NEW.premises_id
        AND lifecycle_event.event_type = 'closed'
    )
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.vpa_private_alerts (
    organisation_id, premises_id, change_event_id, alert_type,
    title, body, source_run_id
  )
  SELECT
    watch.organisation_id, NEW.premises_id, NEW.id, NEW.event_type,
    CASE
      WHEN NEW.event_type = 'closed' THEN 'VPA premises status changed to closed'
      WHEN NEW.event_type = 'reopened' THEN 'VPA premises status changed to active'
      ELSE 'VPA register information changed'
    END,
    'A field published by the Victorian Pharmacy Authority changed. Review the pharmacy registration details before drawing a commercial conclusion.',
    NEW.run_id
  FROM public.vpa_alert_watches AS watch
  WHERE watch.premises_id = NEW.premises_id
    AND (
      (NEW.event_type IN ('closed', 'reopened') AND watch.closure_reopening)
      OR (
        (NEW.event_type LIKE 'licensee_%'
          OR NEW.event_type LIKE 'licence_%'
          OR NEW.event_type LIKE 'licensed_%')
        AND watch.licensee_changes
      )
      OR (
        NEW.event_type = 'vpa_pbs_match_change'
        AND watch.mismatch_review
      )
      OR (
        NEW.event_type = 'registered_until_change'
        AND watch.registration_date_approaching
      )
      OR (
        NEW.event_type NOT IN (
          'closed', 'reopened', 'vpa_pbs_match_change', 'registered_until_change'
        )
        AND NEW.event_type NOT LIKE 'licensee_%'
        AND NEW.event_type NOT LIKE 'licence_%'
        AND NEW.event_type NOT LIKE 'licensed_%'
        AND watch.registration_changes
      )
    )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_private_vpa_alert() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.vpa_alert_watches.nearby_new_premises IS
  'Reserved for a future location-radius watch. It is not consulted by the current per-premises event fan-out.';
COMMENT ON COLUMN public.vpa_alert_watches.registration_changes IS
  'Controls name, address, premises-condition, coordinate, and other registration field-change alerts.';
COMMENT ON COLUMN public.vpa_alert_watches.licensee_changes IS
  'Controls published registered-licensee add, remove, status, date, and condition alerts.';
COMMENT ON COLUMN public.vpa_alert_watches.closure_reopening IS
  'Controls explicit VPA closed and explicit active reopening alerts.';
COMMENT ON COLUMN public.vpa_alert_watches.mismatch_review IS
  'Controls VPA/PBS match-state change alerts, except lifecycle-derived duplicate closure state.';
COMMENT ON COLUMN public.vpa_alert_watches.registration_date_approaching IS
  'Controls published registration-date change alerts; no scheduler is created by this migration.';

-- ---------------------------------------------------------------------------
-- One authoritative default-active predicate. A premises that has ever been
-- explicitly closed remains historical until an explicit active observation
-- records a reopening timestamp.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vpa_in_default_active_map(
  p_status text,
  p_closed_first_observed_at timestamptz,
  p_reopened_last_observed_at timestamptz
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(p_status, 'unknown') IN ('active', 'unknown', 'review_required')
    AND (
      p_closed_first_observed_at IS NULL
      OR (
        p_reopened_last_observed_at IS NOT NULL
        AND p_reopened_last_observed_at >= p_closed_first_observed_at
      )
    )
$$;

REVOKE ALL ON FUNCTION public.vpa_in_default_active_map(text, timestamptz, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vpa_in_default_active_map(text, timestamptz, timestamptz)
  TO anon, authenticated;

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
    NEW.vpa_reopened_last_observed_at := NULL;
    NEW.vpa_pbs_match_state := 'closed_historical';
  ELSIF TG_OP = 'UPDATE'
    AND NEW.vpa_registration_status_normalised = 'active'
    AND NEW.vpa_closed_first_observed_at IS NOT NULL
    AND NEW.vpa_reopened_last_observed_at IS NULL
  THEN
    NEW.vpa_reopened_last_observed_at := COALESCE(NEW.vpa_last_observed_at, now());
    IF NEW.vpa_pbs_match_state = 'closed_historical' THEN
      NEW.vpa_pbs_match_state := 'unresolved';
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND COALESCE(NEW.vpa_registration_status_normalised, 'unknown') <> 'active'
    AND NEW.vpa_closed_first_observed_at IS NOT NULL
    AND NEW.vpa_reopened_last_observed_at IS NULL
  THEN
    -- Unknown, review-required, or blank source state is not a reopening.
    NEW.vpa_pbs_match_state := 'closed_historical';
    NEW.vpa_reopened_last_observed_at := OLD.vpa_reopened_last_observed_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP VIEW public.pharmacy_premises_vpa_lifecycle;

CREATE VIEW public.pharmacy_premises_vpa_lifecycle
WITH (security_invoker = true) AS
SELECT
  p.id, p.name, p.address, p.suburb, p.postcode, p.locality_name, p.location,
  p.vpa_registration_status_normalised, p.vpa_closed_first_observed_at,
  p.vpa_reopened_last_observed_at, p.vpa_pbs_match_state,
  public.vpa_in_default_active_map(
    p.vpa_registration_status_normalised,
    p.vpa_closed_first_observed_at,
    p.vpa_reopened_last_observed_at
  ) AS included_in_default_active_map,
  public.vpa_in_default_active_map(
    p.vpa_registration_status_normalised,
    p.vpa_closed_first_observed_at,
    p.vpa_reopened_last_observed_at
  ) AS included_in_active_commercial_competition
FROM public.pharmacy_premises AS p;

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
    SELECT premises.*
    FROM public.pharmacy_premises AS premises
    WHERE premises.location IS NOT NULL
      AND public.vpa_in_default_active_map(
        premises.vpa_registration_status_normalised,
        premises.vpa_closed_first_observed_at,
        premises.vpa_reopened_last_observed_at
      )
      AND premises.location
        && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
      AND (NOT p_metro_only OR EXISTS (
        SELECT 1 FROM public.dispensing_population_areas AS area
        WHERE area.peer_group = 'metropolitan'
          AND ST_Intersects(area.boundary, premises.location::geometry)
      ))
      AND (NOT p_missing_data OR premises.geocode_method = 'suburb_centroid'
        OR premises.source_confidence = 'approximate'
        OR (premises.phone IS NULL AND premises.website IS NULL))
  ), counted AS (
    SELECT matches.*, count(*) OVER () AS total FROM matches
  ), sampled AS (
    SELECT counted.* FROM counted
    ORDER BY CASE WHEN counted.total > p_limit THEN hashtext(counted.id::text) END NULLS FIRST,
      counted.name, counted.id
    LIMIT p_limit
  )
  SELECT sampled.id, sampled.name, sampled.address, sampled.suburb, sampled.postcode,
    sampled.locality_name, ST_Y(sampled.location::geometry),
    ST_X(sampled.location::geometry), sampled.vpa_registration_status,
    sampled.premises_source, sampled.source_confidence, sampled.geocode_method,
    sampled.total
  FROM sampled ORDER BY sampled.name, sampled.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Geocode evidence: validated canonical status requires approved evidence for
-- the same premises and coordinates within 25 metres. Checks are deferred so a
-- promotion transaction may insert evidence and update the premises in either order.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pharmacy_vpa_geocode_results
  ADD COLUMN IF NOT EXISTS premises_id uuid
    REFERENCES public.pharmacy_premises(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS supersedes_result_id uuid
    REFERENCES public.pharmacy_vpa_geocode_results(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS pharmacy_vpa_geocode_results_premises_idx
  ON public.pharmacy_vpa_geocode_results (premises_id, validation_state, reviewer_status);

REVOKE UPDATE, DELETE ON public.pharmacy_vpa_geocode_results FROM authenticated;
GRANT SELECT, INSERT ON public.pharmacy_vpa_geocode_results TO authenticated;

DROP POLICY IF EXISTS pharmacy_vpa_geocode_results_admin
  ON public.pharmacy_vpa_geocode_results;
CREATE POLICY pharmacy_vpa_geocode_results_admin_read_insert
  ON public.pharmacy_vpa_geocode_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY pharmacy_vpa_geocode_results_admin_insert
  ON public.pharmacy_vpa_geocode_results FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND reviewed_by = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.assert_vpa_validated_geocode(p_premises_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  premises_record public.pharmacy_premises%ROWTYPE;
BEGIN
  SELECT * INTO premises_record
  FROM public.pharmacy_premises
  WHERE id = p_premises_id;

  IF NOT FOUND OR premises_record.vpa_geocode_status <> 'validated' THEN
    RETURN;
  END IF;
  IF premises_record.location IS NULL THEN
    RAISE EXCEPTION 'Validated VPA geocode requires canonical coordinates';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.pharmacy_vpa_geocode_results AS evidence
    WHERE evidence.premises_id = premises_record.id
      AND evidence.validation_state = 'validated'
      AND evidence.reviewer_status = 'approved'
      AND evidence.latitude IS NOT NULL
      AND evidence.longitude IS NOT NULL
      AND ST_DWithin(
        premises_record.location,
        ST_SetSRID(
          ST_MakePoint(evidence.longitude, evidence.latitude), 4326
        )::geography,
        25
      )
  ) THEN
    RAISE EXCEPTION
      'Validated VPA geocode requires approved same-premises evidence within 25 metres';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_vpa_validated_geocode(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_vpa_validated_geocode_from_premises()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_vpa_validated_geocode(NEW.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_vpa_validated_geocode_from_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.premises_id IS NOT NULL THEN
    PERFORM public.assert_vpa_validated_geocode(OLD.premises_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.premises_id IS NOT NULL THEN
    PERFORM public.assert_vpa_validated_geocode(NEW.premises_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_vpa_validated_geocode_from_premises()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_vpa_validated_geocode_from_evidence()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assert_vpa_validated_geocode_on_premises
  ON public.pharmacy_premises;
CREATE CONSTRAINT TRIGGER trg_assert_vpa_validated_geocode_on_premises
  AFTER INSERT OR UPDATE OF vpa_geocode_status, location
  ON public.pharmacy_premises
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vpa_validated_geocode_from_premises();

DROP TRIGGER IF EXISTS trg_assert_vpa_validated_geocode_on_evidence
  ON public.pharmacy_vpa_geocode_results;
CREATE CONSTRAINT TRIGGER trg_assert_vpa_validated_geocode_on_evidence
  AFTER INSERT OR UPDATE OR DELETE
  ON public.pharmacy_vpa_geocode_results
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vpa_validated_geocode_from_evidence();

-- ---------------------------------------------------------------------------
-- Published-licensee identity changes retire the prior relationship. Older
-- observations cannot overwrite newer display names, timestamps, or current state.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_vpa_published_licensee_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  entity_id uuid;
  comparison_name text := public.normalise_vpa_published_name(NEW.licensee_name);
  old_comparison_name text :=
    CASE WHEN TG_OP = 'UPDATE'
      THEN public.normalise_vpa_published_name(OLD.licensee_name)
      ELSE NULL
    END;
  observation_at timestamptz := NEW.last_seen_at;
BEGIN
  IF comparison_name = '' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND old_comparison_name IS DISTINCT FROM comparison_name THEN
    UPDATE public.vpa_published_licensee_relationships AS old_relationship
    SET currently_observed = false,
        last_observed_at = GREATEST(old_relationship.last_observed_at, observation_at)
    FROM public.vpa_published_licensees AS old_entity
    WHERE old_relationship.published_licensee_id = old_entity.id
      AND old_relationship.premises_licensee_id = NEW.id
      AND old_entity.normalised_comparison_name = old_comparison_name;
  END IF;

  INSERT INTO public.vpa_published_licensees (
    normalised_comparison_name, published_display_name, first_observed_at, last_observed_at
  ) VALUES (
    comparison_name, NEW.licensee_name,
    COALESCE(NEW.first_observed_at, observation_at), observation_at
  )
  ON CONFLICT (normalised_comparison_name) DO UPDATE
    SET published_display_name = CASE
          WHEN EXCLUDED.last_observed_at >= public.vpa_published_licensees.last_observed_at
            THEN EXCLUDED.published_display_name
          ELSE public.vpa_published_licensees.published_display_name
        END,
        first_observed_at = LEAST(
          public.vpa_published_licensees.first_observed_at,
          EXCLUDED.first_observed_at
        ),
        last_observed_at = GREATEST(
          public.vpa_published_licensees.last_observed_at,
          EXCLUDED.last_observed_at
        ),
        updated_at = CASE
          WHEN EXCLUDED.last_observed_at >= public.vpa_published_licensees.last_observed_at
            THEN now()
          ELSE public.vpa_published_licensees.updated_at
        END
  RETURNING id INTO entity_id;

  INSERT INTO public.vpa_published_licensee_relationships (
    published_licensee_id, premises_licensee_id, premises_id,
    first_observed_at, last_observed_at, currently_observed
  ) VALUES (
    entity_id, NEW.id, NEW.premises_id,
    COALESCE(NEW.first_observed_at, observation_at),
    observation_at, NEW.currently_observed
  )
  ON CONFLICT (published_licensee_id, premises_licensee_id) DO UPDATE
    SET premises_id = CASE
          WHEN EXCLUDED.last_observed_at
            >= public.vpa_published_licensee_relationships.last_observed_at
            THEN EXCLUDED.premises_id
          ELSE public.vpa_published_licensee_relationships.premises_id
        END,
        first_observed_at = LEAST(
          public.vpa_published_licensee_relationships.first_observed_at,
          EXCLUDED.first_observed_at
        ),
        currently_observed = CASE
          WHEN EXCLUDED.last_observed_at
            >= public.vpa_published_licensee_relationships.last_observed_at
            THEN EXCLUDED.currently_observed
          ELSE public.vpa_published_licensee_relationships.currently_observed
        END,
        last_observed_at = GREATEST(
          public.vpa_published_licensee_relationships.last_observed_at,
          EXCLUDED.last_observed_at
        );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_vpa_published_licensee_entity()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registry search uses accurate source-state vocabulary. The application
-- deduplicates this authenticated official result with the public canonical result.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.vpa_registry_search(text, integer, integer);
CREATE FUNCTION public.vpa_registry_search(
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
  registration_source_status text,
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
      'vpa_pharmacy'::text AS result_type,
      premises.id AS result_id,
      COALESCE(premises.vpa_official_name, premises.name) AS result_name,
      COALESCE(premises.vpa_official_full_address, premises.address) AS result_address,
      premises.suburb AS result_suburb,
      premises.postcode AS result_postcode,
      ST_Y(premises.location::geometry) AS lat,
      ST_X(premises.location::geometry) AS lng,
      premises.vpa_source_verification_status AS registration_source_status,
      greatest(
        similarity(lower(COALESCE(premises.vpa_official_name, premises.name)), q),
        similarity(lower(COALESCE(premises.vpa_official_full_address, premises.address)), q)
      )::double precision AS relevance
    FROM public.pharmacy_premises AS premises
    WHERE premises.vpa_record_key IS NOT NULL
      AND (
        lower(COALESCE(premises.vpa_official_name, premises.name)) % q
        OR lower(COALESCE(premises.vpa_official_full_address, premises.address)) % q
        OR lower(COALESCE(premises.postcode, '')) = q
      )
    UNION ALL
    SELECT DISTINCT
      'vpa_pharmacy', premises.id,
      COALESCE(premises.vpa_official_name, premises.name),
      COALESCE(premises.vpa_official_full_address, premises.address),
      premises.suburb, premises.postcode,
      ST_Y(premises.location::geometry), ST_X(premises.location::geometry),
      premises.vpa_source_verification_status,
      similarity(
        licensee.normalised_comparison_name,
        public.normalise_vpa_published_name(q)
      )
    FROM public.vpa_published_licensees AS licensee
    JOIN public.vpa_published_licensee_relationships AS relationship
      ON relationship.published_licensee_id = licensee.id
      AND relationship.currently_observed
    JOIN public.pharmacy_premises AS premises
      ON premises.id = relationship.premises_id
    WHERE licensee.normalised_comparison_name
      % public.normalise_vpa_published_name(q)
  ), deduplicated AS (
    SELECT DISTINCT ON (matches.result_id)
      matches.*
    FROM matches
    ORDER BY matches.result_id, matches.relevance DESC
  )
  SELECT * FROM deduplicated
  ORDER BY relevance DESC, result_name, result_id
  OFFSET bounded_offset LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.vpa_registry_search(text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vpa_registry_search(text, integer, integer)
  TO authenticated;
