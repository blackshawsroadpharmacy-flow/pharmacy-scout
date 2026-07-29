-- Audit remediation F-01, F-02, F-22, F-23a.
--
-- F-01  There is no way for a user to create or join an organisation, so every
--       private feature is unreachable for a new account. Adds an atomic
--       org-creation RPC and an invitation flow.
-- F-02  setCurrentOrg accepted any organisation UUID; enforced at the DB now.
-- F-22  `anon` retained default SELECT grants on seven org-scoped tables.
-- F-23a createOrg performed three unbatched writes with no transaction.

-- citext: case-insensitive invitation email matching.
-- pgcrypto: gen_random_bytes() for invitation tokens.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- F-22: revoke residual anon privileges on organisation-scoped tables
-- ============================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organisations', 'organisation_members', 'profiles', 'user_roles',
    'pharmacy_businesses', 'opportunities', 'candidate_sites',
    'pharmacy_profiles', 'pharmacy_note_entries', 'pharmacy_im_attachments',
    'relocation_scenarios', 'greenfield_scenarios',
    'greenfield_assessments', 'relocation_assessments',
    'rule_evaluations', 'requirement_evaluations',
    'dispensing_calibration_observations', 'commercial_audit_events'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- F-02 / F-23a: atomic organisation creation
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_organisation(_name TEXT)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org public.organisations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) < 2 OR length(btrim(_name)) > 120 THEN
    RAISE EXCEPTION 'Organisation name must be between 2 and 120 characters';
  END IF;

  INSERT INTO public.organisations (name, created_by)
  VALUES (btrim(_name), auth.uid())
  RETURNING * INTO new_org;

  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  VALUES (new_org.id, auth.uid(), 'owner');

  UPDATE public.profiles
     SET current_organisation_id = new_org.id
   WHERE public.profiles.id = auth.uid();

  RETURN QUERY SELECT new_org.id, new_org.name;
END;
$$;
REVOKE ALL ON FUNCTION public.create_organisation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organisation(TEXT) TO authenticated;

-- ============================================================
-- F-02: current_organisation_id must always be an org you belong to
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_current_organisation_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_organisation_id IS NOT NULL
     AND NEW.current_organisation_id IS DISTINCT FROM OLD.current_organisation_id
     AND NOT EXISTS (
       SELECT 1 FROM public.organisation_members m
       WHERE m.organisation_id = NEW.current_organisation_id
         AND m.user_id = NEW.id
     )
  THEN
    RAISE EXCEPTION 'Cannot select an organisation you are not a member of';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_current_org_membership ON public.profiles;
CREATE TRIGGER trg_profiles_current_org_membership
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_current_organisation_membership();

-- ============================================================
-- F-01: invitations, so an owner can add colleagues
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organisation_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_org_invitations_pending
  ON public.organisation_invitations (organisation_id, email)
  WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_org_invitations_org
  ON public.organisation_invitations (organisation_id);

ALTER TABLE public.organisation_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organisation_invitations FROM anon;
GRANT SELECT, INSERT, DELETE ON public.organisation_invitations TO authenticated;
GRANT ALL ON public.organisation_invitations TO service_role;

-- Only org admins/owners manage invitations. The token is never exposed to a
-- non-member: acceptance goes through the SECURITY DEFINER RPC below.
CREATE POLICY "Org admins read invitations"
  ON public.organisation_invitations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = organisation_invitations.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );
CREATE POLICY "Org admins create invitations"
  ON public.organisation_invitations FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND accepted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = organisation_invitations.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );
CREATE POLICY "Org admins revoke invitations"
  ON public.organisation_invitations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organisation_members m
      WHERE m.organisation_id = organisation_invitations.organisation_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.accept_organisation_invitation(_token TEXT)
RETURNS TABLE (organisation_id UUID, organisation_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation public.organisation_invitations%ROWTYPE;
  user_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO invitation
  FROM public.organisation_invitations i
  WHERE i.token = _token
    AND i.accepted_at IS NULL
    AND i.expires_at > now();

  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid, already used, or expired';
  END IF;
  IF lower(invitation.email::TEXT) IS DISTINCT FROM lower(user_email) THEN
    RAISE EXCEPTION 'This invitation was issued to a different email address';
  END IF;

  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  VALUES (invitation.organisation_id, auth.uid(), invitation.role)
  ON CONFLICT (organisation_id, user_id) DO NOTHING;

  UPDATE public.organisation_invitations
     SET accepted_at = now(), accepted_by = auth.uid()
   WHERE id = invitation.id;

  UPDATE public.profiles
     SET current_organisation_id = invitation.organisation_id
   WHERE public.profiles.id = auth.uid();

  RETURN QUERY
    SELECT o.id, o.name FROM public.organisations o WHERE o.id = invitation.organisation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_organisation_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organisation_invitation(TEXT) TO authenticated;

COMMENT ON TABLE public.organisation_invitations IS
  'Email-scoped, expiring invitations. Acceptance is only possible through accept_organisation_invitation(), which verifies the invited address against auth.users.';
