-- Revoke anonymous access to private VPA tables.
--
-- WHY
-- Migration 20260730152000 revoked anon on pharmacy_premises, pbs_approvals,
-- source_records and the two premises projections, but the VPA tables created by
-- 20260730100000-20260730151000 retained Supabase's default grant to anon. That
-- default comes from the project-level statement:
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
--     GRANT ALL ON TABLES TO "anon";
--
-- VERIFIED STATE BEFORE THIS MIGRATION (from a production schema dump taken
-- 2026-07-30 after 20260730152000 was applied):
--   * 15 of the 16 private VPA tables carry GRANT ALL ... TO anon.
--   * pharmacy_vpa_raw_source_rows is the single exception and has no anon grant.
--   * All 16 have RLS enabled, and NO policy grants anon anything, so anonymous
--     reads and writes are already blocked. This migration is defence in depth,
--     not a fix for live data exposure.
--   * public schema contains no sequences (every VPA table uses a uuid primary
--     key with extensions.gen_random_uuid()), so there are no sequence grants to
--     revoke on existing objects.
--
-- USER-VISIBLE BEHAVIOUR THIS CORRECTS
-- With the table grant present, an anonymous read of pharmacy_premises_licensees
-- succeeds and returns zero rows rather than failing with 42501. The dossier
-- therefore reports "No registered licensee is currently published for this
-- premises" when it should report that sign-in is required. Harmless while the
-- table is empty; actively misleading once VPA licensee data is promoted.
--
-- SCOPE AND SAFETY
-- REVOKE ALL PRIVILEGES is used rather than enumerating SELECT/INSERT/UPDATE/
-- DELETE/TRUNCATE/REFERENCES/TRIGGER individually: it covers that whole set plus
-- version-specific privileges (PostgreSQL 17 adds MAINTAIN, which the production
-- dump shows is present on these tables), and cannot silently omit one.
--
-- Authenticated and service_role privileges are deliberately untouched, including
-- the narrower grants installed by 20260730151000 (geocode evidence is
-- SELECT/INSERT only for authenticated; private alerts are SELECT plus a
-- column-level UPDATE(read_at)).
--
-- Additive and idempotent. No data is read, written, promoted, geocoded or
-- recalculated by applying this migration.

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'pharmacy_premises_licensees',
    'pharmacy_vpa_runs',
    'pharmacy_vpa_staged_premises',
    'pharmacy_vpa_staged_licensees',
    'pharmacy_vpa_match_candidates',
    'pharmacy_vpa_review_queue',
    'pharmacy_vpa_quarantine',
    'pharmacy_vpa_promotion_audit',
    'pharmacy_vpa_change_events',
    'pharmacy_vpa_geocode_results',
    'pharmacy_vpa_raw_source_rows',
    'vpa_published_licensees',
    'vpa_published_licensee_relationships',
    'vpa_alert_watches',
    'vpa_private_alerts',
    'vpa_gdp_staging_comparisons'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = target_table
    ) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM anon', target_table);
    END IF;
  END LOOP;
END
$$;

-- Future tables and views created by the migration owner must be private unless a
-- later migration grants access deliberately. Scoped explicitly to the verified
-- production owner (postgres) and the public schema rather than relying on the
-- session role, so the effect does not depend on who runs the migration.
--
-- Public map, search and dossier access does not depend on this default: those
-- paths are SECURITY DEFINER functions with explicit
-- `GRANT EXECUTE ... TO anon, authenticated` installed by 20260730152000, and
-- remain unaffected.
--
-- Default privileges for FUNCTIONS are intentionally NOT changed. Revoking the
-- anon function default would require every future public RPC to carry an
-- explicit grant, which is a broader behavioural change than this security fix
-- and would risk breaking the anonymous public map if a grant were missed.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

COMMENT ON TABLE public.pharmacy_premises_licensees IS
  'Registered licensee relationships published by the VPA. These rows do not establish beneficial ownership or control. Authenticated access only: anonymous callers receive permission denied so the client presents a sign-in state rather than a false empty result.';
