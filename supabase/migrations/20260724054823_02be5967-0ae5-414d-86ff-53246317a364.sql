
DROP POLICY IF EXISTS "Public can read pharmacy premises" ON public.pharmacy_premises;
DROP POLICY IF EXISTS "Public can read pbs approvals" ON public.pbs_approvals;
DROP POLICY IF EXISTS "Public can read source records" ON public.source_records;

REVOKE SELECT ON public.pharmacy_premises FROM anon;
REVOKE SELECT ON public.pbs_approvals FROM anon;
REVOKE SELECT ON public.source_records FROM anon;

CREATE POLICY "Authenticated can read pharmacy premises"
  ON public.pharmacy_premises FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read pbs approvals"
  ON public.pbs_approvals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read source records"
  ON public.source_records FOR SELECT TO authenticated USING (true);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_premises_door(uuid, double precision, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
