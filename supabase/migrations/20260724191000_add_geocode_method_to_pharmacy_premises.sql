ALTER TABLE public.pharmacy_premises
ADD COLUMN IF NOT EXISTS geocode_method TEXT;

DROP VIEW IF EXISTS public.pharmacy_premises_geo;

CREATE VIEW public.pharmacy_premises_geo
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.name,
  p.address,
  p.suburb,
  p.postcode,
  p.locality_name,
  ST_Y(p.location::geometry)              AS lat,
  ST_X(p.location::geometry)              AS lng,
  ST_Y(p.public_door_location::geometry)  AS door_lat,
  ST_X(p.public_door_location::geometry)  AS door_lng,
  p.door_source,
  p.door_confidence,
  p.door_verified_at,
  p.vpa_registration_status,
  p.vpa_registration_checked_at,
  p.premises_source,
  p.source_confidence,
  p.source_id,
  p.phone,
  p.website,
  p.geocode_method,
  p.notes,
  p.created_at,
  p.updated_at
FROM public.pharmacy_premises p;

GRANT SELECT ON public.pharmacy_premises_geo TO authenticated;
GRANT SELECT ON public.pharmacy_premises_geo TO anon;
