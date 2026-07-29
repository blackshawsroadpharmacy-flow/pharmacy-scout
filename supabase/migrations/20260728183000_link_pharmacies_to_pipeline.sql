-- WP15A: make the public pharmacy dossier and private acquisition pipeline one workflow.

ALTER TABLE public.pharmacy_businesses
  ADD COLUMN IF NOT EXISTS canonical_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS canonical_address_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS date_first_seen DATE,
  ADD COLUMN IF NOT EXISTS listing_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (listing_status IN ('active', 'withdrawn', 'sold', 'unknown'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_businesses_org_premises
  ON public.pharmacy_businesses (organisation_id, premises_id)
  WHERE premises_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pharmacy_pipeline_status(p_premises_id UUID)
RETURNS TABLE (
  business_id UUID,
  opportunity_id UUID,
  pipeline_stage public.pipeline_stage,
  listing_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, o.id, o.pipeline_stage, b.listing_status
  FROM public.profiles p
  JOIN public.pharmacy_businesses b
    ON b.organisation_id = p.current_organisation_id
   AND b.premises_id = p_premises_id
  JOIN public.opportunities o
    ON o.business_id = b.id
   AND o.organisation_id = b.organisation_id
   AND o.type = 'acquisition'
  WHERE p.id = auth.uid()
    AND public.is_org_member(b.organisation_id)
  ORDER BY o.updated_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.add_pharmacy_to_pipeline(
  p_premises_id UUID,
  p_stage public.pipeline_stage DEFAULT 'watchlist',
  p_broker_or_source TEXT DEFAULT NULL,
  p_listing_url TEXT DEFAULT NULL,
  p_asking_price NUMERIC DEFAULT NULL,
  p_date_first_seen DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (business_id UUID, opportunity_id UUID, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  premises public.pharmacy_premises%ROWTYPE;
  biz_id UUID;
  opp_id UUID;
  was_created BOOLEAN := false;
BEGIN
  SELECT current_organisation_id INTO org_id
  FROM public.profiles WHERE id = auth.uid();
  IF org_id IS NULL OR NOT public.is_org_member(org_id) THEN
    RAISE EXCEPTION 'No authorised current organisation';
  END IF;
  SELECT * INTO premises FROM public.pharmacy_premises WHERE id = p_premises_id;
  IF premises.id IS NULL THEN RAISE EXCEPTION 'Pharmacy premises not found'; END IF;
  IF p_listing_url IS NOT NULL
    AND (length(p_listing_url) > 500 OR p_listing_url !~* '^https?://')
  THEN
    RAISE EXCEPTION 'Listing URL must be an HTTP(S) URL no longer than 500 characters';
  END IF;
  IF p_asking_price IS NOT NULL AND p_asking_price < 0 THEN
    RAISE EXCEPTION 'Asking price cannot be negative';
  END IF;

  INSERT INTO public.pharmacy_businesses (
    organisation_id, trading_name, premises_id, opportunity_status,
    asking_price, broker_or_source, listing_url, created_by,
    canonical_name_snapshot, canonical_address_snapshot, date_first_seen
  ) VALUES (
    org_id, premises.name, premises.id, 'active',
    p_asking_price, NULLIF(trim(p_broker_or_source), ''), p_listing_url, auth.uid(),
    premises.name, premises.address, p_date_first_seen
  )
  ON CONFLICT (organisation_id, premises_id) WHERE premises_id IS NOT NULL
  DO UPDATE SET
    broker_or_source = COALESCE(EXCLUDED.broker_or_source, pharmacy_businesses.broker_or_source),
    listing_url = COALESCE(EXCLUDED.listing_url, pharmacy_businesses.listing_url),
    asking_price = COALESCE(EXCLUDED.asking_price, pharmacy_businesses.asking_price)
  RETURNING id, (xmax = 0) INTO biz_id, was_created;

  SELECT id INTO opp_id
  FROM public.opportunities
  WHERE organisation_id = org_id AND business_id = biz_id AND type = 'acquisition'
  ORDER BY updated_at DESC LIMIT 1;
  IF opp_id IS NULL THEN
    INSERT INTO public.opportunities (
      organisation_id, type, title, summary, business_id, pipeline_stage, created_by
    ) VALUES (
      org_id, 'acquisition', premises.name,
      'Linked from canonical Victorian pharmacy premises ' || premises.id::TEXT,
      biz_id, p_stage, auth.uid()
    ) RETURNING id INTO opp_id;
  END IF;
  RETURN QUERY SELECT biz_id, opp_id, was_created;
END;
$$;

REVOKE ALL ON FUNCTION public.pharmacy_pipeline_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_pharmacy_to_pipeline(
  UUID, public.pipeline_stage, TEXT, TEXT, NUMERIC, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pharmacy_pipeline_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_pharmacy_to_pipeline(
  UUID, public.pipeline_stage, TEXT, TEXT, NUMERIC, DATE
) TO authenticated;
