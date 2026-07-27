-- WP14: remove demo-era anonymous commercial access before real confidential data is stored.

ALTER TABLE public.pharmacy_profiles
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS orphaned_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pharmacy_note_entries
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS orphaned_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pharmacy_im_attachments
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS orphaned_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.pharmacy_profiles SET orphaned_demo = true WHERE organisation_id IS NULL;
UPDATE public.pharmacy_note_entries SET orphaned_demo = true WHERE organisation_id IS NULL;
UPDATE public.pharmacy_im_attachments SET orphaned_demo = true WHERE organisation_id IS NULL;

ALTER TABLE public.pharmacy_profiles DROP CONSTRAINT IF EXISTS pharmacy_profiles_premises_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_profiles_org_premises
  ON public.pharmacy_profiles (organisation_id, premises_id)
  WHERE organisation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pharmacy_profiles_organisation
  ON public.pharmacy_profiles (organisation_id);
CREATE INDEX IF NOT EXISTS ix_pharmacy_notes_organisation
  ON public.pharmacy_note_entries (organisation_id);
CREATE INDEX IF NOT EXISTS ix_pharmacy_attachments_organisation
  ON public.pharmacy_im_attachments (organisation_id);

REVOKE ALL ON public.pharmacy_profiles FROM anon;
REVOKE ALL ON public.pharmacy_note_entries FROM anon;
REVOKE ALL ON public.pharmacy_im_attachments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_note_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_im_attachments TO authenticated;

DROP POLICY IF EXISTS "Public can read pharmacy_profiles" ON public.pharmacy_profiles;
DROP POLICY IF EXISTS "Public can insert pharmacy_profiles" ON public.pharmacy_profiles;
DROP POLICY IF EXISTS "Public can update pharmacy_profiles" ON public.pharmacy_profiles;
DROP POLICY IF EXISTS "Public can delete pharmacy_profiles" ON public.pharmacy_profiles;
CREATE POLICY "Organisation members read pharmacy profiles"
  ON public.pharmacy_profiles FOR SELECT TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));
CREATE POLICY "Organisation members create pharmacy profiles"
  ON public.pharmacy_profiles FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NOT NULL
    AND public.is_org_member(organisation_id)
    AND created_by = auth.uid()
    AND orphaned_demo = false
  );
CREATE POLICY "Organisation members update pharmacy profiles"
  ON public.pharmacy_profiles FOR UPDATE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id))
  WITH CHECK (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));
CREATE POLICY "Organisation members delete pharmacy profiles"
  ON public.pharmacy_profiles FOR DELETE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));

DROP POLICY IF EXISTS "Public can read pharmacy_note_entries" ON public.pharmacy_note_entries;
DROP POLICY IF EXISTS "Public can insert pharmacy_note_entries" ON public.pharmacy_note_entries;
CREATE POLICY "Organisation members read pharmacy notes"
  ON public.pharmacy_note_entries FOR SELECT TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));
CREATE POLICY "Organisation members create pharmacy notes"
  ON public.pharmacy_note_entries FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NOT NULL
    AND public.is_org_member(organisation_id)
    AND created_by = auth.uid()
    AND orphaned_demo = false
  );
CREATE POLICY "Organisation members delete pharmacy notes"
  ON public.pharmacy_note_entries FOR DELETE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));

DROP POLICY IF EXISTS "Public can read pharmacy_im_attachments" ON public.pharmacy_im_attachments;
DROP POLICY IF EXISTS "Public can insert pharmacy_im_attachments" ON public.pharmacy_im_attachments;
DROP POLICY IF EXISTS "Public can delete pharmacy_im_attachments" ON public.pharmacy_im_attachments;
CREATE POLICY "Organisation members read attachment metadata"
  ON public.pharmacy_im_attachments FOR SELECT TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));
CREATE POLICY "Organisation members create attachment metadata"
  ON public.pharmacy_im_attachments FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NOT NULL
    AND public.is_org_member(organisation_id)
    AND uploaded_by = auth.uid()
    AND orphaned_demo = false
    AND deleted_at IS NULL
    AND size_bytes BETWEEN 1 AND 26214400
    AND mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    AND file_name !~* '\.(exe|com|bat|cmd|scr|js|jse|vbs|vbe|msi|ps1|sh)(\.|$)'
    AND file_name !~* '\.(pdf|docx|xlsx)\.(pdf|docx|xlsx)$'
    AND split_part(storage_path, '/', 1) = organisation_id::TEXT
  );
CREATE POLICY "Organisation members update attachment metadata"
  ON public.pharmacy_im_attachments FOR UPDATE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id))
  WITH CHECK (
    organisation_id IS NOT NULL
    AND public.is_org_member(organisation_id)
    AND (
      (deleted_at IS NULL AND deleted_by IS NULL)
      OR (deleted_at IS NOT NULL AND deleted_by = auth.uid())
    )
  );
CREATE POLICY "Organisation members delete attachment metadata"
  ON public.pharmacy_im_attachments FOR DELETE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));

DROP POLICY IF EXISTS "Public can read im bucket objects" ON storage.objects;
DROP POLICY IF EXISTS "Public can write im bucket objects" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete im bucket objects" ON storage.objects;
CREATE POLICY "Organisation members read IM objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'information-memorandums'
    AND (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::UUID)
  );
CREATE POLICY "Organisation members upload IM objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'information-memorandums'
    AND (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::UUID)
    AND lower(storage.extension(name)) IN ('pdf', 'docx', 'xlsx')
    AND name !~* '\.(exe|com|bat|cmd|scr|js|jse|vbs|vbe|msi|ps1|sh)(\.|$)'
  );
CREATE POLICY "Organisation members delete IM objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'information-memorandums'
    AND (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::UUID)
  );

UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
WHERE id = 'information-memorandums';

ALTER TABLE public.relocation_scenarios
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS orphaned_demo BOOLEAN NOT NULL DEFAULT false;
UPDATE public.relocation_scenarios SET orphaned_demo = true WHERE organisation_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_relocation_scenarios_organisation
  ON public.relocation_scenarios (organisation_id);
REVOKE ALL ON public.relocation_scenarios FROM anon;
REVOKE ALL ON public.rule_evaluations FROM anon;
REVOKE ALL ON public.requirement_evaluations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relocation_scenarios TO authenticated;
GRANT SELECT ON public.rule_evaluations TO authenticated;
GRANT SELECT ON public.requirement_evaluations TO authenticated;

DROP POLICY IF EXISTS "Public can read relocation scenarios" ON public.relocation_scenarios;
DROP POLICY IF EXISTS "Public can create relocation scenarios" ON public.relocation_scenarios;
DROP POLICY IF EXISTS "Public can update relocation scenarios" ON public.relocation_scenarios;
CREATE POLICY "Organisation members read relocation scenarios"
  ON public.relocation_scenarios FOR SELECT TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));
CREATE POLICY "Organisation members create relocation scenarios"
  ON public.relocation_scenarios FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NOT NULL
    AND public.is_org_member(organisation_id)
    AND actor_id = auth.uid()
    AND orphaned_demo = false
  );
CREATE POLICY "Organisation members update relocation scenarios"
  ON public.relocation_scenarios FOR UPDATE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id))
  WITH CHECK (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));
CREATE POLICY "Organisation members delete relocation scenarios"
  ON public.relocation_scenarios FOR DELETE TO authenticated
  USING (organisation_id IS NOT NULL AND public.is_org_member(organisation_id));

DROP POLICY IF EXISTS "Public can read rule evaluations" ON public.rule_evaluations;
DROP POLICY IF EXISTS "Public can read requirement evaluations" ON public.requirement_evaluations;
CREATE POLICY "Organisation members read rule evaluations"
  ON public.rule_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.relocation_scenarios s
      WHERE s.id = scenario_id AND public.is_org_member(s.organisation_id)
    )
  );
CREATE POLICY "Organisation members read requirement evaluations"
  ON public.requirement_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rule_evaluations e
      JOIN public.relocation_scenarios s ON s.id = e.scenario_id
      WHERE e.id = rule_evaluation_id AND public.is_org_member(s.organisation_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.commercial_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.commercial_audit_events TO authenticated;
GRANT ALL ON public.commercial_audit_events TO service_role;
ALTER TABLE public.commercial_audit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_commercial_audit_org_occurred
  ON public.commercial_audit_events (organisation_id, occurred_at DESC);
CREATE POLICY "Organisation members read audit events"
  ON public.commercial_audit_events FOR SELECT TO authenticated
  USING (public.is_org_member(organisation_id));

CREATE OR REPLACE FUNCTION public.audit_commercial_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  entity UUID;
  event_action TEXT;
  old_row JSONB;
  new_row JSONB;
BEGIN
  old_row := CASE WHEN TG_OP = 'INSERT' THEN '{}'::JSONB ELSE to_jsonb(OLD) END;
  new_row := CASE WHEN TG_OP = 'DELETE' THEN '{}'::JSONB ELSE to_jsonb(NEW) END;
  IF TG_OP = 'DELETE' THEN
    org_id := OLD.organisation_id;
    entity := OLD.id;
  ELSE
    org_id := NEW.organisation_id;
    entity := NEW.id;
  END IF;
  IF org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  event_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'create'
    WHEN TG_OP = 'DELETE' THEN 'delete'
    WHEN TG_TABLE_NAME = 'pharmacy_im_attachments'
      AND old_row ->> 'deleted_at' IS NULL
      AND new_row ->> 'deleted_at' IS NOT NULL
      THEN 'document_delete'
    WHEN TG_TABLE_NAME = 'opportunities'
      AND old_row ->> 'pipeline_stage' IS DISTINCT FROM new_row ->> 'pipeline_stage'
      THEN 'stage_change'
    ELSE 'update'
  END;
  INSERT INTO public.commercial_audit_events (
    organisation_id, actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    org_id, auth.uid(), event_action, TG_TABLE_NAME, entity,
    CASE
      WHEN event_action = 'stage_change'
        THEN jsonb_build_object(
          'from', old_row ->> 'pipeline_stage',
          'to', new_row ->> 'pipeline_stage'
        )
      ELSE '{}'::JSONB
    END
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_pharmacy_profiles ON public.pharmacy_profiles;
CREATE TRIGGER trg_audit_pharmacy_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.pharmacy_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_change();
DROP TRIGGER IF EXISTS trg_audit_pharmacy_businesses ON public.pharmacy_businesses;
CREATE TRIGGER trg_audit_pharmacy_businesses
  AFTER INSERT OR UPDATE OR DELETE ON public.pharmacy_businesses
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_change();
DROP TRIGGER IF EXISTS trg_audit_opportunities ON public.opportunities;
CREATE TRIGGER trg_audit_opportunities
  AFTER INSERT OR UPDATE OR DELETE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_change();
DROP TRIGGER IF EXISTS trg_audit_candidate_sites ON public.candidate_sites;
CREATE TRIGGER trg_audit_candidate_sites
  AFTER INSERT OR UPDATE OR DELETE ON public.candidate_sites
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_change();
DROP TRIGGER IF EXISTS trg_audit_im_attachments ON public.pharmacy_im_attachments;
CREATE TRIGGER trg_audit_im_attachments
  AFTER INSERT OR UPDATE OR DELETE ON public.pharmacy_im_attachments
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_change();

CREATE OR REPLACE FUNCTION public.organisation_security_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT p.current_organisation_id INTO org_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
  IF org_id IS NULL OR NOT public.is_org_member(org_id) THEN
    RAISE EXCEPTION 'No authorised current organisation';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin')
    AND NOT EXISTS (
      SELECT 1 FROM public.organisation_members
      WHERE organisation_id = org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  RETURN jsonb_build_object(
    'organisation_id', org_id,
    'organisation_name', (SELECT name FROM public.organisations WHERE id = org_id),
    'member_count', (SELECT count(*) FROM public.organisation_members WHERE organisation_id = org_id),
    'private_bucket', 'information-memorandums',
    'private_bucket_public', (
      SELECT public FROM storage.buckets WHERE id = 'information-memorandums'
    ),
    'last_audit_event', (
      SELECT max(occurred_at) FROM public.commercial_audit_events WHERE organisation_id = org_id
    ),
    'orphaned_demo_records', (
      (SELECT count(*) FROM public.pharmacy_profiles WHERE orphaned_demo)
      + (SELECT count(*) FROM public.pharmacy_note_entries WHERE orphaned_demo)
      + (SELECT count(*) FROM public.pharmacy_im_attachments WHERE orphaned_demo)
      + (SELECT count(*) FROM public.relocation_scenarios WHERE orphaned_demo)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.organisation_security_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organisation_security_status() TO authenticated;
