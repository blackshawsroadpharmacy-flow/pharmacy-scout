-- Immediate containment and terminology correction for the VPA register integration.
-- Additive and idempotent: the merged 20260730100000 migration remains immutable.

ALTER TABLE public.pharmacy_premises
  ADD COLUMN IF NOT EXISTS published_licensee_names text[],
  ADD COLUMN IF NOT EXISTS vpa_match_status text NOT NULL DEFAULT 'review_required',
  ADD COLUMN IF NOT EXISTS vpa_source_verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS vpa_registration_status_raw text,
  ADD COLUMN IF NOT EXISTS vpa_registration_status_normalised text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS vpa_registered_until date,
  ADD COLUMN IF NOT EXISTS vpa_premises_conditions_raw text,
  ADD COLUMN IF NOT EXISTS vpa_first_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpa_last_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpa_last_successful_run_id uuid,
  ADD COLUMN IF NOT EXISTS vpa_snapshot_reference_date date,
  ADD COLUMN IF NOT EXISTS vpa_currently_observed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vpa_source_row_fingerprint text,
  ADD COLUMN IF NOT EXISTS vpa_match_method text,
  ADD COLUMN IF NOT EXISTS vpa_match_confidence numeric,
  ADD COLUMN IF NOT EXISTS vpa_review_status text NOT NULL DEFAULT 'unreviewed';

UPDATE public.pharmacy_premises
SET published_licensee_names = proprietor_names
WHERE published_licensee_names IS NULL
  AND proprietor_names IS NOT NULL;

COMMENT ON COLUMN public.pharmacy_premises.proprietor_names IS
  'Deprecated compatibility field. VPA publishes registered licensees, not beneficial owners or proprietors. Use published_licensee_names.';
COMMENT ON COLUMN public.pharmacy_premises.published_licensee_names IS
  'Exact names published by the VPA register. Does not establish beneficial ownership or control.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pharmacy_premises_vpa_last_successful_run_fkey'
  ) THEN
    ALTER TABLE public.pharmacy_premises
      ADD CONSTRAINT pharmacy_premises_vpa_last_successful_run_fkey
      FOREIGN KEY (vpa_last_successful_run_id)
      REFERENCES public.pharmacy_vpa_runs(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.pharmacy_premises
  DROP CONSTRAINT IF EXISTS pharmacy_premises_vpa_registration_normalised_check;
ALTER TABLE public.pharmacy_premises
  ADD CONSTRAINT pharmacy_premises_vpa_registration_normalised_check
  CHECK (vpa_registration_status_normalised IN (
    'active', 'closed', 'inactive', 'suspended', 'cancelled',
    'unknown', 'review_required'
  ));

ALTER TABLE public.pharmacy_premises
  DROP CONSTRAINT IF EXISTS pharmacy_premises_vpa_match_status_check;
ALTER TABLE public.pharmacy_premises
  ADD CONSTRAINT pharmacy_premises_vpa_match_status_check
  CHECK (vpa_match_status IN (
    'exact_match', 'high_confidence_match', 'renamed_premises_candidate',
    'relocation_candidate', 'ambiguous_match', 'unmatched_new_premises',
    'duplicate_source_record', 'rejected_match', 'manually_confirmed_match',
    'review_required'
  ));

ALTER TABLE public.pharmacy_premises
  DROP CONSTRAINT IF EXISTS pharmacy_premises_vpa_match_confidence_check;
ALTER TABLE public.pharmacy_premises
  ADD CONSTRAINT pharmacy_premises_vpa_match_confidence_check
  CHECK (vpa_match_confidence IS NULL OR
    (vpa_match_confidence >= 0 AND vpa_match_confidence <= 1));

ALTER TABLE public.pharmacy_premises_licensees
  ADD COLUMN IF NOT EXISTS first_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS currently_observed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_run_id uuid REFERENCES public.pharmacy_vpa_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_row_fingerprint text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed';

COMMENT ON TABLE public.pharmacy_premises_licensees IS
  'Registered licensee relationships published by the VPA. These rows do not establish beneficial ownership or control.';

CREATE INDEX IF NOT EXISTS pharmacy_premises_vpa_registration_normalised_idx
  ON public.pharmacy_premises (vpa_registration_status_normalised);
CREATE INDEX IF NOT EXISTS pharmacy_premises_vpa_currently_observed_idx
  ON public.pharmacy_premises (vpa_currently_observed);
CREATE INDEX IF NOT EXISTS pharmacy_premises_licensees_current_idx
  ON public.pharmacy_premises_licensees (currently_observed, premises_id);
