-- Run-scoped VPA staging, conservative matching review, and atomic promotion.
-- This migration is intentionally additive. It does not import or promote data.

ALTER TABLE public.pharmacy_vpa_runs
  DROP CONSTRAINT IF EXISTS pharmacy_vpa_runs_status_check;
ALTER TABLE public.pharmacy_vpa_runs
  ADD CONSTRAINT pharmacy_vpa_runs_status_check CHECK (status IN (
    'running', 'staged', 'validated', 'promoting', 'promoted', 'failed', 'error'
  ));
ALTER TABLE public.pharmacy_vpa_runs
  ADD COLUMN IF NOT EXISTS source_file_name text,
  ADD COLUMN IF NOT EXISTS source_file_hash text,
  ADD COLUMN IF NOT EXISTS source_reference_date date,
  ADD COLUMN IF NOT EXISTS source_scraped_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_row_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premises_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS licensee_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parser_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cap_warning_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exact_match_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_confidence_match_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ambiguous_match_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposed_new_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposed_closed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposed_reopening_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quarantined_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unresolved_geocode_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_vpa_runs_source_hash_uidx
  ON public.pharmacy_vpa_runs (source_file_hash)
  WHERE source_file_hash IS NOT NULL AND status = 'promoted';

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_staged_premises (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  source_record_key text NOT NULL,
  source_row_fingerprint text NOT NULL,
  official_name text NOT NULL,
  street_address text NOT NULL,
  suburb text NOT NULL,
  state text NOT NULL DEFAULT 'VIC',
  postcode text NOT NULL,
  full_address text NOT NULL,
  registration_status_raw text NOT NULL,
  registration_status_normalised text NOT NULL,
  registered_until date,
  premises_conditions_raw text,
  source_url text NOT NULL,
  source_scraped_at timestamptz NOT NULL,
  disposition text NOT NULL,
  proposed_canonical_premises_id uuid REFERENCES public.pharmacy_premises(id) ON DELETE SET NULL,
  match_score numeric,
  match_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_ids uuid[] NOT NULL DEFAULT '{}',
  algorithm_version text NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  geocode_state text NOT NULL DEFAULT 'unresolved',
  proposed_lat double precision,
  proposed_lng double precision,
  geocode_result_id uuid,
  promotion_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_record_key),
  CHECK (registration_status_normalised IN (
    'active', 'closed', 'inactive', 'suspended', 'cancelled', 'unknown', 'review_required'
  )),
  CHECK (disposition IN (
    'exact_match', 'high_confidence_match', 'renamed_premises_candidate',
    'relocation_candidate', 'ambiguous_match', 'unmatched_new_premises',
    'duplicate_source_record', 'quarantined', 'manually_confirmed_match', 'rejected_match'
  )),
  CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1)),
  CHECK (geocode_state IN ('existing', 'validated', 'unresolved', 'quarantined', 'not_required'))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_staged_licensees (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  staged_premises_id uuid NOT NULL
    REFERENCES public.pharmacy_vpa_staged_premises(id) ON DELETE CASCADE,
  source_row_fingerprint text NOT NULL,
  published_name text NOT NULL,
  licence_status_raw text,
  licensed_until date,
  licence_conditions_raw text,
  currently_observed boolean NOT NULL DEFAULT true,
  review_status text NOT NULL DEFAULT 'unreviewed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, staged_premises_id, published_name)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_match_candidates (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  staged_premises_id uuid NOT NULL
    REFERENCES public.pharmacy_vpa_staged_premises(id) ON DELETE CASCADE,
  canonical_premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  score numeric NOT NULL,
  matching_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  conflicting_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, staged_premises_id, canonical_premises_id)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_review_queue (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  staged_premises_id uuid NOT NULL
    REFERENCES public.pharmacy_vpa_staged_premises(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  decision text,
  selected_canonical_premises_id uuid REFERENCES public.pharmacy_premises(id) ON DELETE SET NULL,
  reviewer uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, staged_premises_id),
  CHECK (status IN ('pending', 'decided', 'rejected')),
  CHECK (decision IS NULL OR decision IN (
    'manually_confirmed_match', 'approve_new_premises', 'rejected_match', 'quarantined'
  ))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_quarantine (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  source_record_key text,
  source_payload jsonb NOT NULL,
  reason_code text NOT NULL,
  reason_detail text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_promotion_audit (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE RESTRICT,
  promoted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  source_file_hash text NOT NULL,
  canonical_rows_updated integer NOT NULL DEFAULT 0,
  canonical_rows_inserted integer NOT NULL DEFAULT 0,
  licensee_rows_upserted integer NOT NULL DEFAULT 0,
  licensee_rows_no_longer_observed integer NOT NULL DEFAULT 0,
  source_freshness_updated boolean NOT NULL DEFAULT false,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (run_id)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_change_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE RESTRICT,
  premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  baseline_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pharmacy_vpa_staged_premises_run_idx
  ON public.pharmacy_vpa_staged_premises (run_id, disposition, review_status);
CREATE INDEX IF NOT EXISTS pharmacy_vpa_staged_premises_address_idx
  ON public.pharmacy_vpa_staged_premises (postcode, lower(suburb));
CREATE INDEX IF NOT EXISTS pharmacy_vpa_staged_licensees_run_idx
  ON public.pharmacy_vpa_staged_licensees (run_id, staged_premises_id);
CREATE INDEX IF NOT EXISTS pharmacy_vpa_review_queue_pending_idx
  ON public.pharmacy_vpa_review_queue (run_id, status);
CREATE INDEX IF NOT EXISTS pharmacy_vpa_change_events_premises_idx
  ON public.pharmacy_vpa_change_events (premises_id, created_at DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'pharmacy_vpa_staged_premises', 'pharmacy_vpa_staged_licensees',
    'pharmacy_vpa_match_candidates', 'pharmacy_vpa_review_queue',
    'pharmacy_vpa_quarantine', 'pharmacy_vpa_promotion_audit',
    'pharmacy_vpa_change_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))',
      table_name || '_admin',
      table_name
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.promote_vpa_import_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  import_run public.pharmacy_vpa_runs%ROWTYPE;
  source_record_id uuid;
  blocking_count integer;
  updated_count integer := 0;
  inserted_count integer := 0;
  licensee_count integer := 0;
  no_longer_observed_count integer := 0;
  has_prior_baseline boolean;
  result jsonb;
BEGIN
  IF current_user_id IS NULL OR NOT public.has_role(current_user_id, 'admin') THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('vpa-import-promotion', 0));
  SELECT * INTO import_run
  FROM public.pharmacy_vpa_runs
  WHERE id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VPA import run not found'; END IF;
  IF import_run.status = 'promoted' THEN
    SELECT result INTO result FROM public.pharmacy_vpa_promotion_audit WHERE run_id = p_run_id;
    RETURN COALESCE(result, '{}'::jsonb);
  END IF;
  IF import_run.status <> 'validated' THEN
    RAISE EXCEPTION 'VPA import run must be validated before promotion';
  END IF;
  IF import_run.parser_error_count > 0 OR import_run.validation_error_count > 0
    OR import_run.cap_warning_count > 0 THEN
    RAISE EXCEPTION 'VPA import run has blocking completeness errors';
  END IF;

  SELECT count(*) INTO blocking_count
  FROM public.pharmacy_vpa_staged_premises
  WHERE run_id = p_run_id
    AND (
      disposition IN ('ambiguous_match', 'relocation_candidate', 'duplicate_source_record', 'quarantined')
      OR review_status = 'review_required'
      OR (disposition = 'unmatched_new_premises'
        AND (NOT promotion_approved OR geocode_state NOT IN ('validated', 'existing')))
    );
  IF blocking_count > 0 THEN
    RAISE EXCEPTION 'VPA import run has % unresolved blocking records', blocking_count;
  END IF;

  SELECT id INTO source_record_id
  FROM public.source_records WHERE source_key = 'vpa_public_register';
  IF source_record_id IS NULL THEN RAISE EXCEPTION 'VPA source record is missing'; END IF;

  UPDATE public.pharmacy_vpa_runs SET status = 'promoting' WHERE id = p_run_id;
  SELECT EXISTS(
    SELECT 1 FROM public.pharmacy_vpa_runs
    WHERE status = 'promoted' AND id <> p_run_id
  ) INTO has_prior_baseline;

  WITH changed AS (
    UPDATE public.pharmacy_premises p
    SET name = s.official_name,
        address = s.street_address,
        suburb = s.suburb,
        postcode = s.postcode,
        vpa_record_key = s.source_record_key,
        published_licensee_names = (
          SELECT array_agg(l.published_name ORDER BY l.published_name)
          FROM public.pharmacy_vpa_staged_licensees l
          WHERE l.staged_premises_id = s.id
        ),
        vpa_match_status = s.disposition,
        vpa_match_method = s.algorithm_version,
        vpa_match_confidence = s.match_score,
        vpa_review_status = s.review_status,
        vpa_source_verification_status = 'authoritative_source',
        vpa_registration_status_raw = s.registration_status_raw,
        vpa_registration_status_normalised = s.registration_status_normalised,
        vpa_registered_until = s.registered_until,
        vpa_premises_conditions_raw = s.premises_conditions_raw,
        vpa_first_observed_at = COALESCE(p.vpa_first_observed_at, import_run.source_scraped_at),
        vpa_last_observed_at = import_run.source_scraped_at,
        vpa_last_successful_run_id = p_run_id,
        vpa_snapshot_reference_date = import_run.source_reference_date,
        vpa_currently_observed = true,
        vpa_source_row_fingerprint = s.source_row_fingerprint,
        vpa_source_id = source_record_id,
        vpa_last_synced_at = import_run.source_scraped_at,
        updated_at = now()
    FROM public.pharmacy_vpa_staged_premises s
    WHERE s.run_id = p_run_id
      AND s.proposed_canonical_premises_id = p.id
      AND s.disposition IN ('exact_match', 'high_confidence_match', 'manually_confirmed_match')
    RETURNING p.id
  )
  SELECT count(*) INTO updated_count FROM changed;

  WITH inserted AS (
    INSERT INTO public.pharmacy_premises (
      id, name, address, suburb, postcode, location,
      vpa_record_key, published_licensee_names, vpa_match_status,
      vpa_match_method, vpa_match_confidence, vpa_review_status,
      vpa_source_verification_status, vpa_registration_status_raw,
      vpa_registration_status_normalised, vpa_registered_until,
      vpa_premises_conditions_raw, vpa_first_observed_at, vpa_last_observed_at,
      vpa_last_successful_run_id, vpa_snapshot_reference_date,
      vpa_currently_observed, vpa_source_row_fingerprint, vpa_source_id,
      vpa_last_synced_at, premises_source, source_confidence, source_id
    )
    SELECT
      extensions.gen_random_uuid(), s.official_name, s.street_address, s.suburb, s.postcode,
      ST_SetSRID(ST_MakePoint(s.proposed_lng, s.proposed_lat), 4326)::geography,
      s.source_record_key,
      (SELECT array_agg(l.published_name ORDER BY l.published_name)
       FROM public.pharmacy_vpa_staged_licensees l WHERE l.staged_premises_id = s.id),
      s.disposition, s.algorithm_version, s.match_score, s.review_status,
      'authoritative_source', s.registration_status_raw, s.registration_status_normalised,
      s.registered_until, s.premises_conditions_raw, import_run.source_scraped_at,
      import_run.source_scraped_at, p_run_id, import_run.source_reference_date, true,
      s.source_row_fingerprint, source_record_id, import_run.source_scraped_at,
      'vpa_register', 'authoritative', source_record_id
    FROM public.pharmacy_vpa_staged_premises s
    WHERE s.run_id = p_run_id
      AND s.disposition = 'unmatched_new_premises'
      AND s.promotion_approved
      AND s.geocode_state IN ('validated', 'existing')
    RETURNING id
  )
  SELECT count(*) INTO inserted_count FROM inserted;

  UPDATE public.pharmacy_premises_licensees l
  SET currently_observed = false
  WHERE l.vpa_source_id = source_record_id
    AND l.currently_observed
    AND NOT EXISTS (
      SELECT 1
      FROM public.pharmacy_vpa_staged_licensees sl
      JOIN public.pharmacy_vpa_staged_premises sp ON sp.id = sl.staged_premises_id
      WHERE sp.run_id = p_run_id
        AND sp.source_record_key = l.vpa_record_key
        AND sl.published_name = l.licensee_name
    );
  GET DIAGNOSTICS no_longer_observed_count = ROW_COUNT;

  INSERT INTO public.pharmacy_premises_licensees (
    premises_id, licensee_name, licensed_until, license_status, conditions,
    source_id, vpa_source_id, vpa_record_key, vpa_premises_name, vpa_street,
    vpa_suburb, vpa_postcode, last_seen_at, first_observed_at, currently_observed,
    source_run_id, source_row_fingerprint, review_status
  )
  SELECT p.id, sl.published_name, sl.licensed_until, sl.licence_status_raw,
    sl.licence_conditions_raw, source_record_id, source_record_id, sp.source_record_key,
    sp.official_name, sp.street_address, sp.suburb, sp.postcode,
    import_run.source_scraped_at, import_run.source_scraped_at, true, p_run_id,
    sl.source_row_fingerprint, sl.review_status
  FROM public.pharmacy_vpa_staged_licensees sl
  JOIN public.pharmacy_vpa_staged_premises sp ON sp.id = sl.staged_premises_id
  JOIN public.pharmacy_premises p ON p.vpa_record_key = sp.source_record_key
  WHERE sp.run_id = p_run_id
  ON CONFLICT (vpa_record_key, licensee_name) DO UPDATE
    SET premises_id = EXCLUDED.premises_id,
        licensed_until = EXCLUDED.licensed_until,
        license_status = EXCLUDED.license_status,
        conditions = EXCLUDED.conditions,
        last_seen_at = EXCLUDED.last_seen_at,
        currently_observed = true,
        source_run_id = EXCLUDED.source_run_id,
        source_row_fingerprint = EXCLUDED.source_row_fingerprint;
  GET DIAGNOSTICS licensee_count = ROW_COUNT;

  UPDATE public.source_records
  SET fetched_at = import_run.source_scraped_at,
      row_count = import_run.premises_count,
      checksum = import_run.source_file_hash,
      confidence = 'authoritative'
  WHERE id = source_record_id;

  result := jsonb_build_object(
    'run_id', p_run_id,
    'canonical_rows_updated', updated_count,
    'canonical_rows_inserted', inserted_count,
    'licensee_rows_upserted', licensee_count,
    'licensee_rows_no_longer_observed', no_longer_observed_count,
    'baseline_established', NOT has_prior_baseline
  );
  INSERT INTO public.pharmacy_vpa_promotion_audit (
    run_id, promoted_by, source_file_hash, canonical_rows_updated,
    canonical_rows_inserted, licensee_rows_upserted,
    licensee_rows_no_longer_observed, source_freshness_updated, result
  ) VALUES (
    p_run_id, current_user_id, import_run.source_file_hash, updated_count,
    inserted_count, licensee_count, no_longer_observed_count, true, result
  );
  UPDATE public.pharmacy_vpa_runs
  SET status = 'promoted', promoted_at = now(), promoted_by = current_user_id,
      finished_at = now()
  WHERE id = p_run_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_vpa_import_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_vpa_import_run(uuid) TO authenticated;

COMMENT ON FUNCTION public.promote_vpa_import_run(uuid) IS
  'Atomically promotes one complete, validated VPA staging run. The function verifies the authenticated administrator and never trusts a caller-supplied identity.';
