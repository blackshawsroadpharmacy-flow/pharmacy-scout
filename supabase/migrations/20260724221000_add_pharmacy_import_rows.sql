CREATE TABLE IF NOT EXISTS public.pharmacy_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_row_number INTEGER NOT NULL,
  matching_key TEXT NOT NULL,
  premises_id UUID REFERENCES public.pharmacy_premises(id) ON DELETE SET NULL,
  disposition TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  geocode_provider TEXT,
  geocode_method TEXT,
  geocode_confidence TEXT,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_name, source_row_number),
  UNIQUE (source_name, matching_key)
);

CREATE INDEX IF NOT EXISTS ix_pharmacy_import_rows_premises_id
  ON public.pharmacy_import_rows (premises_id);

CREATE TRIGGER trg_pharmacy_import_rows_updated
  BEFORE UPDATE ON public.pharmacy_import_rows FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pharmacy_import_rows ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.pharmacy_import_rows TO authenticated;
GRANT ALL ON public.pharmacy_import_rows TO service_role;

DROP POLICY IF EXISTS "Import rows readable by authenticated" ON public.pharmacy_import_rows;
CREATE POLICY "Import rows readable by authenticated"
  ON public.pharmacy_import_rows FOR SELECT TO authenticated USING (true);
