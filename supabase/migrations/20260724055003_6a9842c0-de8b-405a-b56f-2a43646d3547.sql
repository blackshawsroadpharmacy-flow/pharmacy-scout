
DROP POLICY IF EXISTS "Authenticated can read pharmacy premises" ON public.pharmacy_premises;
DROP POLICY IF EXISTS "Authenticated can read pbs approvals" ON public.pbs_approvals;
DROP POLICY IF EXISTS "Authenticated can read source records" ON public.source_records;

GRANT SELECT ON public.pharmacy_premises TO anon;
GRANT SELECT ON public.pbs_approvals TO anon;
GRANT SELECT ON public.source_records TO anon;

CREATE POLICY "Public can read pharmacy premises"
  ON public.pharmacy_premises FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public can read pbs approvals"
  ON public.pbs_approvals FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public can read source records"
  ON public.source_records FOR SELECT TO anon, authenticated USING (true);
