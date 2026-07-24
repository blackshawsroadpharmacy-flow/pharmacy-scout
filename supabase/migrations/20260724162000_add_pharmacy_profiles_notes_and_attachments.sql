CREATE TYPE public.pharmacy_tracker_status AS ENUM (
  'active',
  'underperforming',
  'target',
  'under_offer'
);

CREATE TABLE public.pharmacy_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  premises_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  status public.pharmacy_tracker_status NOT NULL DEFAULT 'active',
  asking_price NUMERIC(14,2),
  revenue NUMERIC(14,2),
  script_volume INTEGER,
  owner_licensee TEXT,
  notes TEXT NOT NULL DEFAULT '',
  notes_updated_at TIMESTAMPTZ,
  notes_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, premises_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_profiles TO authenticated;
GRANT ALL ON public.pharmacy_profiles TO service_role;
ALTER TABLE public.pharmacy_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pharmacy_profiles_updated
  BEFORE UPDATE ON public.pharmacy_profiles FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "pharmacy_profiles select by org" ON public.pharmacy_profiles
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "pharmacy_profiles insert by org" ON public.pharmacy_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organisation_id) AND created_by = auth.uid());
CREATE POLICY "pharmacy_profiles update by org" ON public.pharmacy_profiles
  FOR UPDATE TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "pharmacy_profiles delete by org" ON public.pharmacy_profiles
  FOR DELETE TO authenticated USING (public.is_org_member(organisation_id));

CREATE TABLE public.pharmacy_note_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_profile_id UUID NOT NULL REFERENCES public.pharmacy_profiles(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  premises_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pharmacy_note_entries TO authenticated;
GRANT ALL ON public.pharmacy_note_entries TO service_role;
ALTER TABLE public.pharmacy_note_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pharmacy_note_entries select by org" ON public.pharmacy_note_entries
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "pharmacy_note_entries insert by org" ON public.pharmacy_note_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organisation_id) AND created_by = auth.uid());

CREATE TABLE public.pharmacy_im_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_profile_id UUID NOT NULL REFERENCES public.pharmacy_profiles(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  premises_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.pharmacy_im_attachments TO authenticated;
GRANT ALL ON public.pharmacy_im_attachments TO service_role;
ALTER TABLE public.pharmacy_im_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pharmacy_im_attachments select by org" ON public.pharmacy_im_attachments
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "pharmacy_im_attachments insert by org" ON public.pharmacy_im_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organisation_id) AND uploaded_by = auth.uid());
CREATE POLICY "pharmacy_im_attachments delete by org" ON public.pharmacy_im_attachments
  FOR DELETE TO authenticated USING (public.is_org_member(organisation_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'information-memorandums',
  'information-memorandums',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "im bucket read by org"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'information-memorandums'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "im bucket write by org"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'information-memorandums'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "im bucket delete by org"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'information-memorandums'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE INDEX ix_pharmacy_profiles_org_premises
  ON public.pharmacy_profiles (organisation_id, premises_id);

CREATE INDEX ix_pharmacy_note_entries_profile_created
  ON public.pharmacy_note_entries (pharmacy_profile_id, created_at DESC);

CREATE INDEX ix_pharmacy_im_attachments_profile_created
  ON public.pharmacy_im_attachments (pharmacy_profile_id, created_at DESC);
