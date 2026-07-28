-- WP15C: complete organisation-private acquisition opportunity workspace.

ALTER TABLE public.pharmacy_businesses
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS vendor_contact TEXT,
  ADD COLUMN IF NOT EXISTS broker_name TEXT,
  ADD COLUMN IF NOT EXISTS broker_contact TEXT,
  ADD COLUMN IF NOT EXISTS listing_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS lease_expiry DATE,
  ADD COLUMN IF NOT EXISTS lease_option_periods TEXT,
  ADD COLUMN IF NOT EXISTS annual_rent NUMERIC,
  ADD COLUMN IF NOT EXISTS scripts_per_day NUMERIC,
  ADD COLUMN IF NOT EXISTS gross_profit NUMERIC,
  ADD COLUMN IF NOT EXISTS wages NUMERIC,
  ADD COLUMN IF NOT EXISTS earnings NUMERIC,
  ADD COLUMN IF NOT EXISTS stock_value NUMERIC;

ALTER TABLE public.pharmacy_businesses
  DROP CONSTRAINT IF EXISTS pharmacy_businesses_listing_status_check;
ALTER TABLE public.pharmacy_businesses
  ADD CONSTRAINT pharmacy_businesses_listing_status_check
  CHECK (listing_status IN ('unknown', 'off_market', 'coming_soon', 'listed', 'under_offer', 'sold', 'withdrawn'));

CREATE TABLE IF NOT EXISTS public.opportunity_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  from_stage public.pipeline_stage,
  to_stage public.pipeline_stage NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 300),
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name TEXT,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_listing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  listing_status TEXT NOT NULL,
  listing_url TEXT,
  source TEXT NOT NULL,
  evidence_period_start DATE,
  evidence_period_end DATE,
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK (confidence IN ('unverified', 'low', 'medium', 'high')),
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (listing_status IN ('unknown', 'off_market', 'coming_soon', 'listed', 'under_offer', 'sold', 'withdrawn'))
);

CREATE TABLE IF NOT EXISTS public.opportunity_commercial_figures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 500),
  evidence_period_start DATE,
  evidence_period_end DATE,
  confidence TEXT NOT NULL DEFAULT 'unverified'
    CHECK (confidence IN ('unverified', 'low', 'medium', 'high')),
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (metric IN (
    'asking_price', 'annual_rent', 'revenue', 'scripts_per_day',
    'gross_profit', 'wages', 'earnings', 'stock_value'
  )),
  CHECK (unit IN ('AUD', 'AUD_per_year', 'scripts_per_day'))
);

CREATE TABLE IF NOT EXISTS public.opportunity_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL CHECK (char_length(note_text) BETWEEN 1 AND 10000),
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.opportunities
    WHERE type = 'acquisition' AND business_id IS NOT NULL
      AND pipeline_stage NOT IN ('passed', 'acquired')
    GROUP BY organisation_id, business_id HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_active_acquisition_per_business
      ON public.opportunities (organisation_id, business_id)
      WHERE type = 'acquisition' AND business_id IS NOT NULL
        AND pipeline_stage NOT IN ('passed', 'acquired');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_opportunity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'acquisition' AND NEW.business_id IS NOT NULL
    AND NEW.pipeline_stage NOT IN ('passed', 'acquired')
    AND EXISTS (
      SELECT 1 FROM public.opportunities existing
      WHERE existing.organisation_id = NEW.organisation_id
        AND existing.business_id = NEW.business_id
        AND existing.type = 'acquisition'
        AND existing.pipeline_stage NOT IN ('passed', 'acquired')
        AND existing.id <> NEW.id
    )
  THEN
    RAISE EXCEPTION 'An active opportunity already exists for this pharmacy business'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_duplicate_active_opportunity ON public.opportunities;
CREATE TRIGGER trg_prevent_duplicate_active_opportunity
  BEFORE INSERT OR UPDATE OF business_id, pipeline_stage, type, organisation_id
  ON public.opportunities FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_active_opportunity();

CREATE INDEX IF NOT EXISTS ix_opportunity_stage_history_opp
  ON public.opportunity_stage_history (opportunity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_opportunity_tasks_opp
  ON public.opportunity_tasks (opportunity_id, due_date);
CREATE INDEX IF NOT EXISTS ix_opportunity_figures_opp
  ON public.opportunity_commercial_figures (opportunity_id, metric, entered_at DESC);
CREATE INDEX IF NOT EXISTS ix_opportunity_notes_opp
  ON public.opportunity_notes (opportunity_id, entered_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'opportunity_stage_history', 'opportunity_checklist_items', 'opportunity_tasks',
    'opportunity_listing_history', 'opportunity_commercial_figures',
    'opportunity_notes', 'opportunity_documents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(organisation_id))',
      t || '_org_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organisation_id))',
      t || '_org_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(organisation_id)) WITH CHECK (public.is_org_member(organisation_id))',
      t || '_org_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_org_member(organisation_id))',
      t || '_org_delete', t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.record_opportunity_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
    INSERT INTO public.opportunity_stage_history (
      organisation_id, opportunity_id, from_stage, to_stage, changed_by
    ) VALUES (
      NEW.organisation_id, NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.pipeline_stage END,
      NEW.pipeline_stage, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_stage_history ON public.opportunities;
CREATE TRIGGER trg_opportunity_stage_history
  AFTER INSERT OR UPDATE OF pipeline_stage ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.record_opportunity_stage_change();

DROP TRIGGER IF EXISTS trg_opportunity_checklist_updated ON public.opportunity_checklist_items;
CREATE TRIGGER trg_opportunity_checklist_updated
  BEFORE UPDATE ON public.opportunity_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_opportunity_tasks_updated ON public.opportunity_tasks;
CREATE TRIGGER trg_opportunity_tasks_updated
  BEFORE UPDATE ON public.opportunity_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Opportunity IM objects are kept in the existing private bucket. The first
-- path segment is always the organisation UUID and storage RLS enforces membership.
DROP POLICY IF EXISTS "Org members manage opportunity IM objects" ON storage.objects;
CREATE POLICY "Org members manage opportunity IM objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'information-memorandums'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'information-memorandums'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

REVOKE ALL ON public.opportunity_stage_history,
  public.opportunity_checklist_items, public.opportunity_tasks,
  public.opportunity_listing_history, public.opportunity_commercial_figures,
  public.opportunity_notes, public.opportunity_documents FROM anon;
