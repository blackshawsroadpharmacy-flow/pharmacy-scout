-- Immutable, run-scoped source-row evidence for VPA imports.
-- Canonical promotion continues to use validated staged premises and licensees;
-- this ledger preserves every parsed CSV row for audit and deterministic replay.

CREATE TABLE IF NOT EXISTS public.pharmacy_vpa_raw_source_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pharmacy_vpa_runs(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  source_row_fingerprint text NOT NULL CHECK (length(source_row_fingerprint) = 64),
  source_payload jsonb NOT NULL,
  parse_status text NOT NULL DEFAULT 'parsed'
    CHECK (parse_status IN ('parsed', 'quarantined')),
  parse_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_row_number),
  UNIQUE (run_id, source_row_fingerprint, source_row_number),
  CHECK (
    (parse_status = 'parsed' AND parse_error IS NULL)
    OR (parse_status = 'quarantined' AND nullif(btrim(parse_error), '') IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS pharmacy_vpa_raw_source_rows_run_idx
  ON public.pharmacy_vpa_raw_source_rows (run_id, source_row_number);

ALTER TABLE public.pharmacy_vpa_raw_source_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacy_vpa_raw_source_rows_admin"
  ON public.pharmacy_vpa_raw_source_rows;
CREATE POLICY "pharmacy_vpa_raw_source_rows_admin"
  ON public.pharmacy_vpa_raw_source_rows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON TABLE public.pharmacy_vpa_raw_source_rows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pharmacy_vpa_raw_source_rows TO authenticated;

COMMENT ON TABLE public.pharmacy_vpa_raw_source_rows IS
  'Immutable per-run VPA source-row evidence. No canonical pharmacy state is derived from this table until validation and promotion.';
