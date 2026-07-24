CREATE TYPE public.pharmacy_tracker_status AS ENUM (
  'active',
  'underperforming',
  'target',
  'under_offer'
);

CREATE TABLE public.pharmacy_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  UNIQUE (premises_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_profiles TO anon, authenticated;
GRANT ALL ON public.pharmacy_profiles TO service_role;
ALTER TABLE public.pharmacy_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pharmacy_profiles_updated
  BEFORE UPDATE ON public.pharmacy_profiles FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- TODO: lock down before real data.
CREATE POLICY "Public can read pharmacy_profiles" ON public.pharmacy_profiles
  FOR SELECT TO anon, authenticated USING (true);
-- TODO: lock down before real data.
CREATE POLICY "Public can insert pharmacy_profiles" ON public.pharmacy_profiles
  FOR INSERT TO anon, authenticated WITH CHECK (true);
-- TODO: lock down before real data.
CREATE POLICY "Public can update pharmacy_profiles" ON public.pharmacy_profiles
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
-- TODO: lock down before real data.
CREATE POLICY "Public can delete pharmacy_profiles" ON public.pharmacy_profiles
  FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE public.pharmacy_note_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_profile_id UUID NOT NULL REFERENCES public.pharmacy_profiles(id) ON DELETE CASCADE,
  premises_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pharmacy_note_entries TO anon, authenticated;
GRANT ALL ON public.pharmacy_note_entries TO service_role;
ALTER TABLE public.pharmacy_note_entries ENABLE ROW LEVEL SECURITY;

-- TODO: lock down before real data.
CREATE POLICY "Public can read pharmacy_note_entries" ON public.pharmacy_note_entries
  FOR SELECT TO anon, authenticated USING (true);
-- TODO: lock down before real data.
CREATE POLICY "Public can insert pharmacy_note_entries" ON public.pharmacy_note_entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.pharmacy_im_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_profile_id UUID NOT NULL REFERENCES public.pharmacy_profiles(id) ON DELETE CASCADE,
  premises_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.pharmacy_im_attachments TO anon, authenticated;
GRANT ALL ON public.pharmacy_im_attachments TO service_role;
ALTER TABLE public.pharmacy_im_attachments ENABLE ROW LEVEL SECURITY;

-- TODO: lock down before real data.
CREATE POLICY "Public can read pharmacy_im_attachments" ON public.pharmacy_im_attachments
  FOR SELECT TO anon, authenticated USING (true);
-- TODO: lock down before real data.
CREATE POLICY "Public can insert pharmacy_im_attachments" ON public.pharmacy_im_attachments
  FOR INSERT TO anon, authenticated WITH CHECK (true);
-- TODO: lock down before real data.
CREATE POLICY "Public can delete pharmacy_im_attachments" ON public.pharmacy_im_attachments
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'information-memorandums',
  'information-memorandums',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- TODO: lock down before real data.
CREATE POLICY "Public can read im bucket objects"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'information-memorandums');

-- TODO: lock down before real data.
CREATE POLICY "Public can write im bucket objects"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'information-memorandums');

-- TODO: lock down before real data.
CREATE POLICY "Public can delete im bucket objects"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'information-memorandums');

CREATE INDEX ix_pharmacy_profiles_premises
  ON public.pharmacy_profiles (premises_id);

CREATE INDEX ix_pharmacy_note_entries_profile_created
  ON public.pharmacy_note_entries (pharmacy_profile_id, created_at DESC);

CREATE INDEX ix_pharmacy_im_attachments_profile_created
  ON public.pharmacy_im_attachments (pharmacy_profile_id, created_at DESC);
