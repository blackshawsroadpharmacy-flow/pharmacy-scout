-- WP22: authoritative healthcare-demand anchors.
-- Generated from the Australian Government aged-care service list; no capacity is inferred.

CREATE TABLE public.healthcare_anchor_sources (
  id UUID PRIMARY KEY,
  dataset_name TEXT NOT NULL,
  publisher TEXT NOT NULL,
  exact_endpoint TEXT NOT NULL,
  licence TEXT NOT NULL,
  reference_date DATE NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  source_sha256 TEXT NOT NULL,
  rows_imported INTEGER NOT NULL,
  coverage_notes TEXT[] NOT NULL DEFAULT '{}',
  field_definitions JSONB NOT NULL
);
ALTER TABLE public.healthcare_anchor_sources ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.healthcare_anchor_sources TO anon,authenticated;
CREATE POLICY public_reads_healthcare_anchor_sources ON public.healthcare_anchor_sources
  FOR SELECT TO anon,authenticated USING (true);

INSERT INTO public.healthcare_anchor_sources VALUES (
  '22000000-0000-4000-8000-000000000001',
  'Aged care service list: 30 June 2025 — Victoria',
  'Australian Government Department of Health, Disability and Ageing',
  '__SOURCE_URL__','Creative Commons Attribution 4.0 International','2025-06-30',
  '2026-07-29T05:00:00Z','__SOURCE_SHA256__',__ROW_COUNT__,
  ARRAY[
    'Residential places are published approved places, not occupied beds',
    'The publication does not expose a stable authoritative service identifier',
    'Coordinates are source-published and have not been re-geocoded',
    'Operational status is unavailable in this annual list'
  ],
  '{"residential_places":"Australian Government published residential places; not inferred capacity","care_type":"Source-published care type","coordinate_method":"Source-published latitude/longitude"}'
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.healthcare_anchor_raw (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.healthcare_anchor_sources(id),
  source_record_key TEXT NOT NULL,
  source_row_reference TEXT,
  raw_record JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id,source_record_key)
);
ALTER TABLE public.healthcare_anchor_raw ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.healthcare_anchor_raw TO anon,authenticated;
CREATE POLICY public_reads_healthcare_anchor_raw ON public.healthcare_anchor_raw
  FOR SELECT TO anon,authenticated USING (true);

CREATE TABLE public.healthcare_anchors (
  id UUID PRIMARY KEY,
  raw_id UUID NOT NULL UNIQUE REFERENCES public.healthcare_anchor_raw(id),
  category TEXT NOT NULL CHECK (category IN (
    'residential_aged_care','hospital','medical_centre','community_health','urgent_care'
  )),
  canonical_name TEXT NOT NULL,
  provider TEXT,
  address TEXT,
  suburb TEXT,
  state TEXT,
  postcode TEXT,
  facility_type TEXT,
  approved_places INTEGER CHECK (approved_places IS NULL OR approved_places >= 0),
  hospital_type TEXT CHECK (hospital_type IS NULL OR hospital_type IN (
    'public','private','day','specialist','unknown'
  )),
  emergency_department BOOLEAN,
  operational_status TEXT,
  authoritative_identifier TEXT,
  location GEOGRAPHY(POINT,4326) NOT NULL,
  coordinate_method TEXT NOT NULL,
  evidence_confidence TEXT NOT NULL CHECK (evidence_confidence IN ('high','medium','low')),
  source_date DATE NOT NULL,
  source_id UUID NOT NULL REFERENCES public.healthcare_anchor_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX healthcare_anchors_location_gix ON public.healthcare_anchors USING gist(location);
ALTER TABLE public.healthcare_anchors ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.healthcare_anchors TO anon,authenticated;
CREATE POLICY public_reads_healthcare_anchors ON public.healthcare_anchors
  FOR SELECT TO anon,authenticated USING (true);

CREATE TEMP TABLE wp22_aged_care (
  id UUID,source_key TEXT,name TEXT,provider TEXT,address TEXT,suburb TEXT,state TEXT,postcode TEXT,
  care_type TEXT,residential_places INTEGER,lat DOUBLE PRECISION,lng DOUBLE PRECISION,
  organisation_type TEXT,source_row TEXT
);
INSERT INTO wp22_aged_care VALUES
__AGED_CARE_ROWS__;

INSERT INTO public.healthcare_anchor_raw(id,source_id,source_record_key,source_row_reference,raw_record)
SELECT id,'22000000-0000-4000-8000-000000000001',source_key,source_row,
  jsonb_build_object(
    'name',name,'provider',provider,'address',address,'suburb',suburb,'state',state,
    'postcode',postcode,'care_type',care_type,'residential_places',residential_places,
    'latitude',lat,'longitude',lng,'organisation_type',organisation_type
  )
FROM wp22_aged_care ON CONFLICT (source_id,source_record_key) DO NOTHING;

INSERT INTO public.healthcare_anchors(
  id,raw_id,category,canonical_name,provider,address,suburb,state,postcode,facility_type,
  approved_places,operational_status,authoritative_identifier,location,coordinate_method,
  evidence_confidence,source_date,source_id
)
SELECT id,id,'residential_aged_care',name,provider,address,suburb,state,postcode,care_type,
  residential_places,NULL,NULL,ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography,
  'source-published coordinate','high','2025-06-30',
  '22000000-0000-4000-8000-000000000001'
FROM wp22_aged_care ON CONFLICT (id) DO UPDATE SET
  canonical_name=EXCLUDED.canonical_name,provider=EXCLUDED.provider,address=EXCLUDED.address,
  suburb=EXCLUDED.suburb,postcode=EXCLUDED.postcode,facility_type=EXCLUDED.facility_type,
  approved_places=EXCLUDED.approved_places,location=EXCLUDED.location,
  source_date=EXCLUDED.source_date,updated_at=now();
DROP TABLE wp22_aged_care;

CREATE OR REPLACE FUNCTION public.healthcare_anchors_in_viewport(
  west DOUBLE PRECISION,south DOUBLE PRECISION,east DOUBLE PRECISION,north DOUBLE PRECISION,
  categories TEXT[] DEFAULT NULL
) RETURNS TABLE (
  id UUID,category TEXT,name TEXT,provider TEXT,address TEXT,suburb TEXT,facility_type TEXT,
  approved_places INTEGER,hospital_type TEXT,emergency_department BOOLEAN,
  operational_status TEXT,lat DOUBLE PRECISION,lng DOUBLE PRECISION,
  evidence_confidence TEXT,source_date DATE
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT a.id,a.category,a.canonical_name,a.provider,a.address,a.suburb,a.facility_type,
    a.approved_places,a.hospital_type,a.emergency_department,a.operational_status,
    ST_Y(a.location::geometry),ST_X(a.location::geometry),a.evidence_confidence,a.source_date
  FROM public.healthcare_anchors a
  WHERE a.location::geometry && ST_MakeEnvelope(west,south,east,north,4326)
    AND (categories IS NULL OR a.category=ANY(categories))
  ORDER BY a.canonical_name LIMIT 750;
$$;
GRANT EXECUTE ON FUNCTION public.healthcare_anchors_in_viewport(
  DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,TEXT[]
) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.healthcare_demand_at_point(
  p_lat DOUBLE PRECISION,p_lng DOUBLE PRECISION
) RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH origin AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography AS point
  ), measured AS (
    SELECT a.*,(ST_Distance(a.location,origin.point))::INTEGER distance_m FROM origin
    JOIN public.healthcare_anchors a ON ST_DWithin(a.location,origin.point,5000)
  )
  SELECT jsonb_build_object(
    'aged_care_500m',count(*) FILTER (WHERE category='residential_aged_care' AND distance_m<=500),
    'aged_care_1km',count(*) FILTER (WHERE category='residential_aged_care' AND distance_m<=1000),
    'aged_care_2km',count(*) FILTER (WHERE category='residential_aged_care' AND distance_m<=2000),
    'aged_care_5km',count(*) FILTER (WHERE category='residential_aged_care' AND distance_m<=5000),
    'approved_places_500m',sum(approved_places) FILTER (WHERE category='residential_aged_care' AND distance_m<=500),
    'approved_places_1km',sum(approved_places) FILTER (WHERE category='residential_aged_care' AND distance_m<=1000),
    'approved_places_2km',sum(approved_places) FILTER (WHERE category='residential_aged_care' AND distance_m<=2000),
    'approved_places_5km',sum(approved_places) FILTER (WHERE category='residential_aged_care' AND distance_m<=5000),
    'nearest_hospital_m',NULL,
    'hospitals_5km',NULL,
    'weighted_healthcare_anchor_index',
      round((coalesce(sum(approved_places) FILTER (WHERE category='residential_aged_care' AND distance_m<=2000),0)/50.0
        + count(*) FILTER (WHERE category='hospital' AND distance_m<=5000)*2
        + count(*) FILTER (WHERE category='medical_centre' AND distance_m<=2000))::numeric,2),
    'source_coverage',jsonb_build_object(
      'aged_care','Official Australian Government list at 30 June 2025',
      'hospitals','No authoritative statewide hospital import in this package; unavailable is not zero',
      'medical_centres','Existing OpenStreetMap discovery layer retained separately'
    ),
    'warning','Healthcare anchors indicate geographic demand context, not guaranteed prescription volume'
  ) FROM measured;
$$;
GRANT EXECUTE ON FUNCTION public.healthcare_demand_at_point(DOUBLE PRECISION,DOUBLE PRECISION)
  TO anon,authenticated;

ALTER TABLE public.pharmacy_dispensing_potential ADD COLUMN IF NOT EXISTS healthcare_anchor_evidence JSONB;
UPDATE public.pharmacy_dispensing_potential potential SET
  healthcare_anchor_evidence=public.healthcare_demand_at_point(
    ST_Y(p.location::geometry),ST_X(p.location::geometry)
  ),
  raw_metrics=potential.raw_metrics || jsonb_build_object(
    'official_healthcare_anchor_context',public.healthcare_demand_at_point(
      ST_Y(p.location::geometry),ST_X(p.location::geometry)
    )
  )
FROM public.pharmacy_premises p
WHERE p.id=potential.pharmacy_id AND p.location IS NOT NULL;

CREATE OR REPLACE FUNCTION public.scenario_evidence_at_point(
  p_lat DOUBLE PRECISION,p_lng DOUBLE PRECISION,p_radius_m INTEGER
) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.candidate_site_analysis(p_lat,p_lng,p_radius_m)
    || jsonb_build_object(
      'evidence_contract_version','wp22-v1','captured_at',now(),
      'official_demographics',public.demographic_context_at_point(p_lat,p_lng),
      'healthcare_demand',public.healthcare_demand_at_point(p_lat,p_lng),
      'missing_inputs',jsonb_build_array(
        'SA2 averages are not precise site catchments',
        'healthcare anchors do not imply guaranteed prescription volume',
        'authoritative statewide hospital coverage remains unavailable'
      )
    );
$$;
REVOKE ALL ON FUNCTION public.scenario_evidence_at_point(
  DOUBLE PRECISION,DOUBLE PRECISION,INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scenario_evidence_at_point(
  DOUBLE PRECISION,DOUBLE PRECISION,INTEGER
) TO authenticated;
