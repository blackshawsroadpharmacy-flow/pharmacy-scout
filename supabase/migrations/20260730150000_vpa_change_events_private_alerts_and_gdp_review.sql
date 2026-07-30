-- VPA delta events, organisation-private alert foundations, and staging-only
-- GDP comparison records. No alerts or model refreshes are generated on apply.

CREATE TABLE IF NOT EXISTS public.vpa_alert_watches (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  registration_changes boolean NOT NULL DEFAULT true,
  licensee_changes boolean NOT NULL DEFAULT true,
  closure_reopening boolean NOT NULL DEFAULT true,
  nearby_new_premises boolean NOT NULL DEFAULT false,
  mismatch_review boolean NOT NULL DEFAULT true,
  registration_date_approaching boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, premises_id)
);

CREATE TABLE IF NOT EXISTS public.vpa_private_alerts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  change_event_id uuid REFERENCES public.pharmacy_vpa_change_events(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  source_run_id uuid REFERENCES public.pharmacy_vpa_runs(id) ON DELETE RESTRICT,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, change_event_id, alert_type)
);

CREATE TABLE IF NOT EXISTS public.vpa_gdp_staging_comparisons (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE RESTRICT,
  model_version text NOT NULL,
  premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  change_explanations text[] NOT NULL DEFAULT '{}',
  evidence_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_approval_status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, model_version, premises_id),
  CHECK (human_approval_status IN ('pending', 'approved', 'rejected'))
);

ALTER TABLE public.vpa_alert_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpa_private_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpa_gdp_staging_comparisons ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpa_alert_watches, public.vpa_private_alerts
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpa_gdp_staging_comparisons TO authenticated;
GRANT ALL ON public.vpa_alert_watches, public.vpa_private_alerts,
  public.vpa_gdp_staging_comparisons TO service_role;

DROP POLICY IF EXISTS vpa_alert_watches_org_members ON public.vpa_alert_watches;
CREATE POLICY vpa_alert_watches_org_members ON public.vpa_alert_watches
  FOR ALL TO authenticated
  USING (public.is_org_member(organisation_id))
  WITH CHECK (
    public.is_org_member(organisation_id)
    AND created_by = auth.uid()
  );
DROP POLICY IF EXISTS vpa_private_alerts_org_members ON public.vpa_private_alerts;
CREATE POLICY vpa_private_alerts_org_members ON public.vpa_private_alerts
  FOR ALL TO authenticated
  USING (public.is_org_member(organisation_id))
  WITH CHECK (public.is_org_member(organisation_id));
DROP POLICY IF EXISTS vpa_gdp_staging_comparisons_admin
  ON public.vpa_gdp_staging_comparisons;
CREATE POLICY vpa_gdp_staging_comparisons_admin
  ON public.vpa_gdp_staging_comparisons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS vpa_alert_watches_premises_idx
  ON public.vpa_alert_watches (premises_id, organisation_id);
CREATE INDEX IF NOT EXISTS vpa_private_alerts_org_unread_idx
  ON public.vpa_private_alerts (organisation_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS vpa_gdp_staging_comparisons_run_idx
  ON public.vpa_gdp_staging_comparisons (run_id, human_approval_status);

CREATE OR REPLACE FUNCTION public.vpa_has_prior_baseline(p_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_vpa_runs
    WHERE status = 'promoted' AND id <> p_run_id
  )
$$;

REVOKE ALL ON FUNCTION public.vpa_has_prior_baseline(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_vpa_premises_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  run_id uuid := NEW.vpa_last_successful_run_id;
BEGIN
  IF run_id IS NULL OR NOT public.vpa_has_prior_baseline(run_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, new_value
    ) VALUES (run_id, NEW.id, 'new_premises', to_jsonb(NEW.vpa_record_key));
    RETURN NEW;
  END IF;
  IF OLD.vpa_registration_status_normalised IS DISTINCT FROM NEW.vpa_registration_status_normalised
  THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id,
      CASE
        WHEN NEW.vpa_registration_status_normalised = 'closed' THEN 'closed'
        WHEN OLD.vpa_registration_status_normalised = 'closed'
          AND NEW.vpa_registration_status_normalised = 'active' THEN 'reopened'
        ELSE 'registration_status_change'
      END,
      'vpa_registration_status_normalised',
      to_jsonb(OLD.vpa_registration_status_normalised),
      to_jsonb(NEW.vpa_registration_status_normalised)
    );
  END IF;
  IF OLD.vpa_registered_until IS DISTINCT FROM NEW.vpa_registered_until THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id, 'registered_until_change', 'vpa_registered_until',
      to_jsonb(OLD.vpa_registered_until), to_jsonb(NEW.vpa_registered_until)
    );
  END IF;
  IF OLD.vpa_premises_conditions_raw IS DISTINCT FROM NEW.vpa_premises_conditions_raw THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id, 'premises_condition_change', 'vpa_premises_conditions_raw',
      to_jsonb(OLD.vpa_premises_conditions_raw), to_jsonb(NEW.vpa_premises_conditions_raw)
    );
  END IF;
  IF OLD.vpa_official_name IS DISTINCT FROM NEW.vpa_official_name THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id, 'name_change', 'vpa_official_name',
      to_jsonb(OLD.vpa_official_name), to_jsonb(NEW.vpa_official_name)
    );
  END IF;
  IF OLD.vpa_official_full_address IS DISTINCT FROM NEW.vpa_official_full_address THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id, 'address_change', 'vpa_official_full_address',
      to_jsonb(OLD.vpa_official_full_address), to_jsonb(NEW.vpa_official_full_address)
    );
  END IF;
  IF OLD.vpa_pbs_match_state IS DISTINCT FROM NEW.vpa_pbs_match_state THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id, 'vpa_pbs_match_change', 'vpa_pbs_match_state',
      to_jsonb(OLD.vpa_pbs_match_state), to_jsonb(NEW.vpa_pbs_match_state)
    );
  END IF;
  IF OLD.location IS DISTINCT FROM NEW.location THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.id, 'coordinate_change', 'location',
      to_jsonb(ST_AsText(OLD.location::geometry)), to_jsonb(ST_AsText(NEW.location::geometry))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_vpa_premises_changes ON public.pharmacy_premises;
CREATE TRIGGER trg_capture_vpa_premises_changes
  AFTER INSERT OR UPDATE OF
    vpa_registration_status_normalised, vpa_registered_until,
    vpa_premises_conditions_raw, vpa_official_name, vpa_official_full_address,
    vpa_pbs_match_state, location, vpa_last_successful_run_id
  ON public.pharmacy_premises
  FOR EACH ROW EXECUTE FUNCTION public.capture_vpa_premises_changes();

CREATE OR REPLACE FUNCTION public.capture_vpa_licensee_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  run_id uuid := NEW.source_run_id;
BEGIN
  IF run_id IS NULL OR NOT public.vpa_has_prior_baseline(run_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, new_value
    ) VALUES (run_id, NEW.premises_id, 'licensee_added', 'licensee_name', to_jsonb(NEW.licensee_name));
    RETURN NEW;
  END IF;
  IF OLD.currently_observed AND NOT NEW.currently_observed THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value
    ) VALUES (run_id, NEW.premises_id, 'licensee_removed', 'licensee_name', to_jsonb(NEW.licensee_name));
  END IF;
  IF OLD.license_status IS DISTINCT FROM NEW.license_status THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.premises_id, 'licence_status_change', 'license_status',
      to_jsonb(OLD.license_status), to_jsonb(NEW.license_status)
    );
  END IF;
  IF OLD.licensed_until IS DISTINCT FROM NEW.licensed_until THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.premises_id, 'licensed_until_change', 'licensed_until',
      to_jsonb(OLD.licensed_until), to_jsonb(NEW.licensed_until)
    );
  END IF;
  IF OLD.conditions IS DISTINCT FROM NEW.conditions THEN
    INSERT INTO public.pharmacy_vpa_change_events (
      run_id, premises_id, event_type, field_name, old_value, new_value
    ) VALUES (
      run_id, NEW.premises_id, 'licence_condition_change', 'conditions',
      to_jsonb(OLD.conditions), to_jsonb(NEW.conditions)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_vpa_licensee_changes
  ON public.pharmacy_premises_licensees;
CREATE TRIGGER trg_capture_vpa_licensee_changes
  AFTER INSERT OR UPDATE OF currently_observed, license_status, licensed_until,
    conditions, source_run_id
  ON public.pharmacy_premises_licensees
  FOR EACH ROW EXECUTE FUNCTION public.capture_vpa_licensee_changes();

CREATE OR REPLACE FUNCTION public.create_private_vpa_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.vpa_private_alerts (
    organisation_id, premises_id, change_event_id, alert_type,
    title, body, source_run_id
  )
  SELECT
    w.organisation_id, NEW.premises_id, NEW.id, NEW.event_type,
    CASE
      WHEN NEW.event_type = 'closed' THEN 'VPA premises status changed to closed'
      WHEN NEW.event_type = 'reopened' THEN 'VPA premises status changed to active'
      ELSE 'VPA register information changed'
    END,
    'A field published by the Victorian Pharmacy Authority changed. Review the source event before drawing a commercial conclusion.',
    NEW.run_id
  FROM public.vpa_alert_watches w
  WHERE w.premises_id = NEW.premises_id
    AND (
      (NEW.event_type IN ('closed', 'reopened') AND w.closure_reopening)
      OR (
        (NEW.event_type LIKE 'licensee_%'
          OR NEW.event_type LIKE 'licence_%'
          OR NEW.event_type LIKE 'licensed_%')
        AND w.licensee_changes
      )
      OR (
        NEW.event_type NOT LIKE 'licensee_%'
        AND NEW.event_type NOT LIKE 'licence_%'
        AND NEW.event_type NOT LIKE 'licensed_%'
        AND w.registration_changes
      )
    )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_private_vpa_alert
  ON public.pharmacy_vpa_change_events;
CREATE TRIGGER trg_create_private_vpa_alert
  AFTER INSERT ON public.pharmacy_vpa_change_events
  FOR EACH ROW EXECUTE FUNCTION public.create_private_vpa_alert();

COMMENT ON TABLE public.vpa_gdp_staging_comparisons IS
  'Staging-only before/after evidence for a specific VPA run and existing GDP model. Rows do not activate or validate a model and require explicit human review.';
