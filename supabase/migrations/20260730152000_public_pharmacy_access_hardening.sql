-- Public pharmacy access hardening.
-- Removes anonymous base-table enumeration and exposes only bounded, explicit
-- public projections. Applying this migration does not import, promote, geocode,
-- alert, or otherwise modify canonical pharmacy data.

-- Anonymous callers must not enumerate the canonical base table. Authenticated
-- users retain the existing read policy; administrators retain existing writes.
REVOKE ALL ON public.pharmacy_premises FROM anon;
DROP POLICY IF EXISTS "Authenticated can read pharmacy premises"
  ON public.pharmacy_premises;
DROP POLICY IF EXISTS "Public can read pharmacy premises"
  ON public.pharmacy_premises;
DROP POLICY IF EXISTS "premises readable by authenticated"
  ON public.pharmacy_premises;
CREATE POLICY "premises readable by authenticated"
  ON public.pharmacy_premises FOR SELECT TO authenticated
  USING (true);

-- PBS notes and source-record hashes are also excluded from anonymous direct
-- enumeration. The public dossier and freshness RPCs expose their safe subsets.
REVOKE ALL ON public.pbs_approvals FROM anon;
DROP POLICY IF EXISTS "Public can read pbs approvals" ON public.pbs_approvals;
DROP POLICY IF EXISTS "pbs_approvals readable by authenticated"
  ON public.pbs_approvals;
CREATE POLICY "pbs_approvals readable by authenticated"
  ON public.pbs_approvals FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.source_records FROM anon;
DROP POLICY IF EXISTS "Public can read source records" ON public.source_records;
DROP POLICY IF EXISTS "Authenticated can read source records"
  ON public.source_records;
DROP POLICY IF EXISTS "source_records readable by authenticated"
  ON public.source_records;
CREATE POLICY "source_records readable by authenticated"
  ON public.source_records FOR SELECT TO authenticated USING (true);

-- The legacy geographic view remains useful to authenticated workflows, but is
-- no longer a public dossier or an anonymous path around the base-table revoke.
REVOKE ALL ON public.pharmacy_premises_geo FROM anon;
GRANT SELECT ON public.pharmacy_premises_geo TO authenticated;

-- The lifecycle projection is intentionally authenticated-only. Public map and
-- dossier consumers receive the approved status fields from bounded functions.
REVOKE ALL ON public.pharmacy_premises_vpa_lifecycle FROM anon;
GRANT SELECT ON public.pharmacy_premises_vpa_lifecycle TO authenticated;

-- One-record public dossier. It intentionally excludes source IDs, hashes,
-- matching scores/methods, review state, geocode evidence state, user identity,
-- notes, and all organisation/commercial workflow data.
CREATE OR REPLACE FUNCTION public.public_pharmacy_dossier(p_premises_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  suburb text,
  postcode text,
  locality_name text,
  lat double precision,
  lng double precision,
  door_lat double precision,
  door_lng double precision,
  vpa_registration_status public.verification_status,
  premises_source public.premises_source_type,
  source_confidence text,
  geocode_method text,
  phone text,
  website text,
  source_name text,
  source_url text,
  source_fetched_at timestamptz,
  pbs_approvals jsonb,
  vpa_official_name text,
  vpa_official_full_address text,
  vpa_registration_status_raw text,
  vpa_registration_status_normalised text,
  vpa_registered_until date,
  vpa_premises_conditions_raw text,
  vpa_source_verification_status text,
  vpa_first_observed_at timestamptz,
  vpa_last_observed_at timestamptz,
  vpa_snapshot_reference_date date,
  vpa_pbs_match_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
ROWS 1
AS $$
  SELECT
    premises.id,
    premises.name,
    premises.address,
    premises.suburb,
    premises.postcode,
    premises.locality_name,
    ST_Y(premises.location::geometry),
    ST_X(premises.location::geometry),
    ST_Y(premises.public_door_location::geometry),
    ST_X(premises.public_door_location::geometry),
    premises.vpa_registration_status,
    premises.premises_source,
    CASE
      WHEN premises.source_confidence = 'approximate' THEN 'approximate'
      WHEN premises.source_confidence IN (
        'high', 'exact', 'verified', 'provider_exact'
      ) THEN 'verified'
      ELSE NULL
    END,
    CASE
      WHEN premises.geocode_method = 'suburb_centroid' THEN 'suburb_centroid'
      WHEN premises.geocode_method IS NULL THEN NULL
      ELSE 'address_level'
    END,
    premises.phone,
    premises.website,
    source.source_name,
    source.source_url,
    source.fetched_at,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'approval_number', approval.approval_number,
          'approval_status', approval.approval_status
        )
        ORDER BY approval.approval_number
      )
      FROM public.pbs_approvals AS approval
      WHERE approval.premises_id = premises.id
    ), '[]'::jsonb),
    premises.vpa_official_name,
    premises.vpa_official_full_address,
    premises.vpa_registration_status_raw,
    premises.vpa_registration_status_normalised,
    premises.vpa_registered_until,
    premises.vpa_premises_conditions_raw,
    premises.vpa_source_verification_status,
    premises.vpa_first_observed_at,
    premises.vpa_last_observed_at,
    premises.vpa_snapshot_reference_date,
    premises.vpa_pbs_match_state
  FROM public.pharmacy_premises AS premises
  LEFT JOIN public.source_records AS source ON source.id = premises.source_id
  WHERE premises.id = p_premises_id
$$;

REVOKE ALL ON FUNCTION public.public_pharmacy_dossier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_pharmacy_dossier(uuid)
  TO anon, authenticated;

COMMENT ON FUNCTION public.public_pharmacy_dossier(uuid) IS
  'Returns at most one explicitly approved public pharmacy dossier. Internal matching, review, evidence, note, workflow, and organisation fields are excluded.';

-- The public viewport is a deliberately SECURITY DEFINER read because anonymous
-- base-table access is revoked. Bounds, Victorian extent, and row cap are
-- enforced in the database, and the output signature contains only map fields.
CREATE OR REPLACE FUNCTION public.pharmacy_points_in_viewport(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_missing_data boolean DEFAULT false,
  p_metro_only boolean DEFAULT false,
  p_limit integer DEFAULT 2000
) RETURNS TABLE (
  id uuid,
  name text,
  address text,
  suburb text,
  postcode text,
  locality_name text,
  lat double precision,
  lng double precision,
  vpa_registration_status public.verification_status,
  premises_source public.premises_source_type,
  source_confidence text,
  geocode_method text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  bounded_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
BEGIN
  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 2000) THEN
    RAISE EXCEPTION 'Invalid limit';
  END IF;
  IF p_west IS NULL OR p_south IS NULL OR p_east IS NULL OR p_north IS NULL
    OR p_west < 140 OR p_east > 150 OR p_south < -40 OR p_north > -33
    OR p_west >= p_east OR p_south >= p_north
  THEN
    RAISE EXCEPTION 'Invalid Victorian viewport';
  END IF;

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
      AND (
        NOT p_metro_only
        OR EXISTS (
          SELECT 1
          FROM public.dispensing_population_areas AS area
          WHERE area.peer_group = 'metropolitan'
            AND ST_Intersects(area.boundary, premises.location::geometry)
        )
      )
      AND (
        NOT p_missing_data
        OR premises.geocode_method = 'suburb_centroid'
        OR premises.source_confidence = 'approximate'
        OR (premises.phone IS NULL AND premises.website IS NULL)
      )
  ), counted AS (
    SELECT matches.*, count(*) OVER () AS total
    FROM matches
  ), sampled AS (
    SELECT counted.*
    FROM counted
    ORDER BY
      CASE
        WHEN counted.total > bounded_limit THEN hashtext(counted.id::text)
      END NULLS FIRST,
      counted.name,
      counted.id
    LIMIT bounded_limit
  )
  SELECT
    sampled.id,
    sampled.name,
    sampled.address,
    sampled.suburb,
    sampled.postcode,
    sampled.locality_name,
    ST_Y(sampled.location::geometry),
    ST_X(sampled.location::geometry),
    sampled.vpa_registration_status,
    sampled.premises_source,
    CASE
      WHEN sampled.source_confidence = 'approximate' THEN 'approximate'
      WHEN sampled.source_confidence IN (
        'high', 'exact', 'verified', 'provider_exact'
      ) THEN 'verified'
      ELSE NULL
    END,
    CASE
      WHEN sampled.geocode_method = 'suburb_centroid' THEN 'suburb_centroid'
      WHEN sampled.geocode_method IS NULL THEN NULL
      ELSE 'address_level'
    END,
    sampled.total
  FROM sampled
  ORDER BY sampled.name, sampled.id;
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

-- Existing statewide search is already bounded and validates its query. Add
-- pg_temp to both SECURITY DEFINER search paths without changing signatures.
ALTER FUNCTION public.statewide_location_search(text, integer)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.statewide_location_search_without_healthcare(text, integer)
  SET search_path = public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION public.statewide_location_search(
  p_query text,
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
  is_private boolean,
  relevance double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  q text := lower(trim(COALESCE(p_query, '')));
  bounded_limit integer := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 30);
BEGIN
  IF length(q) < 2 OR length(q) > 120 OR q ~ '[[:cntrl:]]' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH results AS (
    SELECT
      base.result_type,
      base.result_id,
      base.result_name,
      base.result_address,
      base.result_suburb,
      base.result_postcode,
      base.lat,
      base.lng,
      CASE
        WHEN base.result_type = 'pharmacy'
          AND base.source_confidence = 'approximate' THEN 'approximate'
        WHEN base.result_type = 'pharmacy'
          AND base.source_confidence IN (
            'high', 'exact', 'verified', 'provider_exact'
          ) THEN 'verified'
        WHEN base.result_type = 'pharmacy' THEN NULL
        ELSE base.source_confidence
      END,
      base.is_private,
      base.relevance
    FROM public.statewide_location_search_without_healthcare(
      q, bounded_limit
    ) AS base

    UNION ALL

    SELECT
      'aged_care'::text,
      anchor.id,
      anchor.canonical_name,
      anchor.address,
      anchor.suburb,
      anchor.postcode,
      ST_Y(anchor.location::geometry),
      ST_X(anchor.location::geometry),
      CASE
        WHEN anchor.evidence_confidence IN ('high', 'verified') THEN 'verified'
        WHEN anchor.evidence_confidence = 'approximate' THEN 'approximate'
        ELSE NULL
      END,
      false,
      (
        CASE
          WHEN lower(anchor.canonical_name) = q THEN 100
          WHEN lower(anchor.canonical_name) LIKE q || '%' THEN 80
          WHEN lower(COALESCE(anchor.postcode, '')) = q THEN 70
          WHEN lower(COALESCE(anchor.suburb, '')) = q THEN 65
          ELSE 0
        END
        + greatest(
          similarity(lower(anchor.canonical_name), q),
          similarity(lower(COALESCE(anchor.address, '')), q),
          similarity(lower(COALESCE(anchor.suburb, '')), q)
        ) * 25
      )::double precision
    FROM public.healthcare_anchors AS anchor
    WHERE anchor.category = 'residential_aged_care'
      AND anchor.location IS NOT NULL
      AND (
        lower(anchor.canonical_name) % q
        OR lower(COALESCE(anchor.address, '')) % q
        OR lower(COALESCE(anchor.suburb, '')) % q
        OR lower(COALESCE(anchor.postcode, '')) = q
        OR lower(anchor.canonical_name) LIKE '%' || q || '%'
        OR lower(COALESCE(anchor.address, '')) LIKE '%' || q || '%'
      )
  )
  SELECT results.*
  FROM results
  WHERE results.relevance >= 8
  ORDER BY results.relevance DESC, results.result_name
  LIMIT bounded_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.statewide_location_search(text, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.statewide_location_search(text, integer)
  TO anon, authenticated;

ALTER FUNCTION public.public_data_freshness()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.candidate_nearest_pharmacy(
  double precision, double precision, boolean, integer
) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.candidate_pharmacies_within_radius(
  double precision, double precision, integer
) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.candidate_site_analysis(
  double precision, double precision, integer
) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.candidate_external_within_500m(
  text, double precision, double precision
) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.candidate_external_summary(
  double precision, double precision
) SET search_path = public, extensions, pg_temp;

-- Watches are personal preferences within an organisation. Members cannot
-- alter or delete another member's preference.
ALTER TABLE public.vpa_alert_watches
  DROP CONSTRAINT IF EXISTS vpa_alert_watches_organisation_id_premises_id_key;
ALTER TABLE public.vpa_alert_watches
  ADD CONSTRAINT vpa_alert_watches_org_premises_creator_key
  UNIQUE (organisation_id, premises_id, created_by);

DROP POLICY IF EXISTS vpa_alert_watches_org_members
  ON public.vpa_alert_watches;
DROP POLICY IF EXISTS vpa_alert_watches_personal_select
  ON public.vpa_alert_watches;
DROP POLICY IF EXISTS vpa_alert_watches_personal_insert
  ON public.vpa_alert_watches;
DROP POLICY IF EXISTS vpa_alert_watches_personal_update
  ON public.vpa_alert_watches;
DROP POLICY IF EXISTS vpa_alert_watches_personal_delete
  ON public.vpa_alert_watches;

CREATE POLICY vpa_alert_watches_personal_select
  ON public.vpa_alert_watches FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    AND public.is_org_member(organisation_id)
  );
CREATE POLICY vpa_alert_watches_personal_insert
  ON public.vpa_alert_watches FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(organisation_id)
  );
CREATE POLICY vpa_alert_watches_personal_update
  ON public.vpa_alert_watches FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND public.is_org_member(organisation_id)
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(organisation_id)
  );
CREATE POLICY vpa_alert_watches_personal_delete
  ON public.vpa_alert_watches FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    AND public.is_org_member(organisation_id)
  );

COMMENT ON TABLE public.vpa_alert_watches IS
  'Personal VPA notification preferences scoped to an organisation. Only the creator may read or manage a watch.';

-- Suppress the derived PBS/VPA mismatch alert for both closure and reopening.
CREATE OR REPLACE FUNCTION public.create_private_vpa_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.event_type = 'vpa_pbs_match_change'
    AND (
      (
        NEW.new_value = to_jsonb('closed_historical'::text)
        AND EXISTS (
          SELECT 1
          FROM public.pharmacy_vpa_change_events AS lifecycle_event
          WHERE lifecycle_event.run_id = NEW.run_id
            AND lifecycle_event.premises_id = NEW.premises_id
            AND lifecycle_event.event_type = 'closed'
        )
      )
      OR (
        NEW.old_value = to_jsonb('closed_historical'::text)
        AND EXISTS (
          SELECT 1
          FROM public.pharmacy_vpa_change_events AS lifecycle_event
          WHERE lifecycle_event.run_id = NEW.run_id
            AND lifecycle_event.premises_id = NEW.premises_id
            AND lifecycle_event.event_type = 'reopened'
        )
      )
    )
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.vpa_private_alerts (
    organisation_id, premises_id, change_event_id, alert_type,
    title, body, source_run_id
  )
  SELECT DISTINCT
    watch.organisation_id,
    NEW.premises_id,
    NEW.id,
    NEW.event_type,
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

REVOKE ALL ON FUNCTION public.create_private_vpa_alert()
  FROM PUBLIC, anon, authenticated;
