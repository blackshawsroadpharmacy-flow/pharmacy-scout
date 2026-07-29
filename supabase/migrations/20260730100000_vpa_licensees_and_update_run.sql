-- VPA public-register refresh workspace. Additive and idempotent.

ALTER TABLE public.pharmacy_premises
  ADD COLUMN IF NOT EXISTS vpa_record_key text,
  ADD COLUMN IF NOT EXISTS proprietor_names text[],
  ADD COLUMN IF NOT EXISTS vpa_last_synced_at timestamptz;

-- Older deployments identify source rows by kind/name and do not yet expose
-- the source_key described by the refresh contract.
ALTER TABLE public.source_records
  ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS source_records_source_key_uidx
  ON public.source_records (source_key);

CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_premises_vpa_record_key_uidx
  ON public.pharmacy_premises (vpa_record_key)
  WHERE vpa_record_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pharmacy_premises_licensees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  premises_id uuid NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  licensee_name text NOT NULL,
  licensed_until date,
  license_status text,
  conditions text,
  source_id uuid REFERENCES public.source_records(id) ON DELETE SET NULL,
  vpa_source_id uuid REFERENCES public.source_records(id) ON DELETE SET NULL,
  vpa_record_key text NOT NULL,
  vpa_premises_name text NOT NULL,
  vpa_street text,
  vpa_suburb text,
  vpa_postcode text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_premises_licensees_record_name_key
    UNIQUE (vpa_record_key, licensee_name)
);

CREATE INDEX IF NOT EXISTS pharmacy_premises_licensees_premises_idx
  ON public.pharmacy_premises_licensees (premises_id);
CREATE INDEX IF NOT EXISTS pharmacy_premises_licensees_record_idx
  ON public.pharmacy_premises_licensees (vpa_record_key);

GRANT INSERT, UPDATE ON public.pharmacy_premises TO authenticated;
GRANT INSERT, UPDATE ON public.source_records TO authenticated;

ALTER TABLE public.pharmacy_premises_licensees ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_premises_licensees TO authenticated;
GRANT ALL ON public.pharmacy_premises_licensees TO service_role;

DROP POLICY IF EXISTS "VPA licensees readable by authenticated"
  ON public.pharmacy_premises_licensees;
CREATE POLICY "VPA licensees readable by authenticated"
  ON public.pharmacy_premises_licensees
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "VPA licensees admin write"
  ON public.pharmacy_premises_licensees;
CREATE POLICY "VPA licensees admin write"
  ON public.pharmacy_premises_licensees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  premises_added integer NOT NULL DEFAULT 0,
  premises_updated integer NOT NULL DEFAULT 0,
  premises_removed integer NOT NULL DEFAULT 0,
  licensees_upserted integer NOT NULL DEFAULT 0,
  postcodes_queried integer NOT NULL DEFAULT 0,
  postcodes_with_cap_warning integer NOT NULL DEFAULT 0,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'ok', 'error')),
  error_message text
);

ALTER TABLE public.pharmacy_vpa_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.pharmacy_vpa_runs TO authenticated;
GRANT ALL ON public.pharmacy_vpa_runs TO service_role;

DROP POLICY IF EXISTS "VPA runs admin access" ON public.pharmacy_vpa_runs;
CREATE POLICY "VPA runs admin access"
  ON public.pharmacy_vpa_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.source_records (
  source_key,
  source_name,
  source_kind,
  source_url,
  confidence,
  notes
)
VALUES (
  'vpa_public_register',
  'VPA Public Register',
  'vpa_register',
  'https://pharmacy.vic.gov.au/register-search/',
  'authoritative',
  'Victorian Pharmacy Authority public premises and licensee register.'
)
ON CONFLICT (source_key) DO NOTHING;
