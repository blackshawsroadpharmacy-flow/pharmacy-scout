-- WP17: explainable, versioned geographic dispensing potential.
-- This is relative commercial screening, never actual dispensing volume.

CREATE TABLE public.dispensing_potential_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  weights JSONB NOT NULL,
  minimum_calibration_observations INTEGER NOT NULL DEFAULT 100,
  validation_requirements JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.dispensing_potential_methods (
  version, label, weights, minimum_calibration_observations, validation_requirements, active
) VALUES (
  'gdp-v1.0.0',
  'Geographic Dispensing Potential v1',
  '{"demand_pressure":0.30,"competitive_position":0.30,"healthcare_anchors":0.20,"retail_anchors":0.10,"growth_outlook":0.10}',
  100,
  '{"required":"documented holdout validation and adequate geographic coverage","scripts_day_output":"disabled until threshold and validation are met"}',
  true
);

CREATE TABLE public.pharmacy_dispensing_potential (
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  method_id UUID NOT NULL REFERENCES public.dispensing_potential_methods(id),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_metrics JSONB NOT NULL,
  component_scores JSONB NOT NULL,
  missing_inputs TEXT[] NOT NULL DEFAULT '{}',
  warnings TEXT[] NOT NULL DEFAULT '{}',
  evidence_confidence TEXT NOT NULL CHECK (evidence_confidence IN ('low','medium','high')),
  relative_score NUMERIC,
  victorian_percentile NUMERIC CHECK (victorian_percentile IS NULL OR victorian_percentile BETWEEN 0 AND 100),
  peer_group TEXT,
  peer_percentile NUMERIC CHECK (peer_percentile IS NULL OR peer_percentile BETWEEN 0 AND 100),
  explanation JSONB NOT NULL,
  experimental_scripts_day_equivalent NUMERIC,
  theoretical_scripts_day_low NUMERIC,
  theoretical_scripts_day_high NUMERIC,
  scripts_day_status TEXT NOT NULL DEFAULT 'Scripts/day estimate not yet calibrated',
  PRIMARY KEY (pharmacy_id, method_id),
  CHECK (
    scripts_day_status <> 'Scripts/day estimate not yet calibrated'
    OR (
      experimental_scripts_day_equivalent IS NULL
      AND theoretical_scripts_day_low IS NULL
      AND theoretical_scripts_day_high IS NULL
    )
  )
);

CREATE TABLE public.dispensing_calibration_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacy_premises(id) ON DELETE CASCADE,
  observed_scripts_per_day NUMERIC NOT NULL CHECK (observed_scripts_per_day > 0),
  evidence_period_start DATE NOT NULL,
  evidence_period_end DATE NOT NULL,
  trading_days_per_week NUMERIC NOT NULL CHECK (trading_days_per_week > 0 AND trading_days_per_week <= 7),
  includes_private_prescriptions BOOLEAN,
  includes_under_copayment BOOLEAN,
  includes_daa_volume BOOLEAN,
  includes_institutional_supply BOOLEAN,
  source_type TEXT NOT NULL,
  source_document_or_note TEXT,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (evidence_period_end >= evidence_period_start)
);

CREATE TABLE public.dispensing_demographic_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_name TEXT NOT NULL,
  exact_source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  licence TEXT NOT NULL,
  geography_level TEXT NOT NULL,
  boundary_edition TEXT NOT NULL,
  reference_year INTEGER NOT NULL,
  fields_used TEXT[] NOT NULL,
  import_method TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  row_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.dispensing_population_areas (
  sa2_code_2021 TEXT PRIMARY KEY,
  sa2_name_2021 TEXT NOT NULL,
  boundary GEOMETRY(MULTIPOLYGON,4326) NOT NULL,
  population_2023 NUMERIC,
  population_2024 NUMERIC,
  annual_growth_count NUMERIC,
  annual_growth_percent NUMERIC,
  area_km2 NUMERIC,
  population_density_2024 NUMERIC,
  source_id UUID NOT NULL REFERENCES public.dispensing_demographic_sources(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dispensing_demographic_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_population_areas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dispensing_demographic_sources TO anon, authenticated;
GRANT SELECT ON public.dispensing_population_areas TO anon, authenticated;
GRANT ALL ON public.dispensing_demographic_sources TO service_role;
GRANT ALL ON public.dispensing_population_areas TO service_role;
CREATE POLICY public_reads_demographic_provenance ON public.dispensing_demographic_sources
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_reads_population_areas ON public.dispensing_population_areas
  FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX ix_dispensing_population_areas_boundary
  ON public.dispensing_population_areas USING GIST(boundary);

INSERT INTO public.dispensing_demographic_sources (
  id,dataset_name,exact_source,source_url,licence,geography_level,boundary_edition,
  reference_year,fields_used,import_method,fetched_at,row_count
) VALUES (
  '17000000-0000-4000-8000-000000000001',
  'Regional Population 2023-24 — SA2_RP_2024',
  'Australian Bureau of Statistics',
  'https://geo.abs.gov.au/arcgis/rest/services/Hosted/SA2_RP_2024/FeatureServer/0',
  'Creative Commons Attribution 4.0 International',
  'Statistical Area Level 2','ASGS Edition 3 SA2 2021',2024,
  ARRAY['pop_yr1','pop_yr2','chg_yr_to_yr_no','chg_y_to_y','area_km2','pop_dens_yr'],
  'Reproducible ArcGIS FeatureServer GeoJSON query for Victorian SA2 codes',
  '2026-07-29T00:00:00Z',522
);

ALTER TABLE public.dispensing_potential_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_dispensing_potential ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_calibration_observations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dispensing_potential_methods, public.pharmacy_dispensing_potential TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispensing_calibration_observations TO authenticated;
GRANT ALL ON public.dispensing_potential_methods, public.pharmacy_dispensing_potential,
  public.dispensing_calibration_observations TO service_role;
CREATE POLICY public_reads_potential_methods ON public.dispensing_potential_methods
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_reads_relative_potential ON public.pharmacy_dispensing_potential
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY calibration_org_select ON public.dispensing_calibration_observations
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY calibration_org_insert ON public.dispensing_calibration_observations
  FOR INSERT TO authenticated WITH CHECK (
    public.is_org_member(organisation_id) AND entered_by = auth.uid()
  );
CREATE POLICY calibration_org_update ON public.dispensing_calibration_observations
  FOR UPDATE TO authenticated USING (public.is_org_member(organisation_id))
  WITH CHECK (public.is_org_member(organisation_id));
CREATE POLICY calibration_org_delete ON public.dispensing_calibration_observations
  FOR DELETE TO authenticated USING (public.is_org_member(organisation_id));
CREATE TRIGGER trg_dispensing_calibration_updated BEFORE UPDATE
  ON public.dispensing_calibration_observations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_dispensing_potential_v1()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INTEGER;
BEGIN
  INSERT INTO public.pharmacy_dispensing_potential (
    pharmacy_id, method_id, calculated_at, raw_metrics, component_scores,
    missing_inputs, warnings, evidence_confidence, relative_score, explanation
  )
  SELECT p.id, m.id, now(),
    jsonb_build_object(
      'pharmacies_500m', nearby.pharmacies_500m,
      'pharmacies_1km', nearby.pharmacies_1km,
      'pharmacies_2km', nearby.pharmacies_2km,
      'pharmacies_5km', nearby.pharmacies_5km,
      'nearest_competing_pharmacy_m', nearby.nearest_competitor_m,
      'distance_weighted_pharmacy_competition', nearby.weighted_competition,
      'medical_centres_500m', nearby.medical_500m,
      'medical_centres_1km', nearby.medical_1km,
      'medical_centres_2km', nearby.medical_2km,
      'supermarkets_500m', nearby.supermarkets_500m,
      'supermarkets_1km', nearby.supermarkets_1km,
      'supermarkets_2km', nearby.supermarkets_2km,
      'surrounding_population_sa2_2024', pop.population_2024,
      'population_density_2024', pop.population_density_2024,
      'population_growth_2023_2024_percent', pop.annual_growth_percent,
      'demographic_reference_period', 'ABS ERP 2024; growth 2023-24; ASGS Edition 3 SA2 2021',
      'pharmacy_coordinate_quality', COALESCE(p.geocode_method,'unknown')
    ),
    jsonb_build_object(
      'demand_pressure', CASE WHEN pop.population_density_2024 IS NULL THEN NULL
        ELSE least(100, greatest(0, pop.population_density_2024 / 25)) END,
      'competitive_position', greatest(0, 100 - nearby.pharmacies_2km * 5),
      'healthcare_anchors', least(100, nearby.medical_1km * 20),
      'retail_anchors', least(100, nearby.supermarkets_1km * 20),
      'growth_outlook', CASE WHEN pop.annual_growth_percent IS NULL THEN NULL
        ELSE least(100, greatest(0, 50 + pop.annual_growth_percent * 10)) END
    ),
    array_remove(ARRAY[
      CASE WHEN pop.population_2024 IS NULL THEN 'surrounding_population' END,
      CASE WHEN pop.annual_growth_percent IS NULL THEN 'population_growth' END,
      'age_disability_SEIFA_vehicle_access',
      'metropolitan_or_regional_peer_group'
    ],NULL),
    ARRAY['External-location absence is not evidence of none','No prescription volume is inferred'],
    CASE WHEN pop.population_2024 IS NULL THEN 'low' ELSE 'medium' END,
    round((COALESCE(least(100, greatest(0, pop.population_density_2024 / 25)),0)
      + greatest(0, 100 - nearby.pharmacies_2km * 5)
      + least(100, nearby.medical_1km * 20)
      + least(100, nearby.supermarkets_1km * 20)
      + COALESCE(least(100, greatest(0, 50 + pop.annual_growth_percent * 10)),0))
      / CASE WHEN pop.population_2024 IS NULL THEN 3.0 ELSE 5.0 END, 2),
    jsonb_build_object(
      'positive_factors', jsonb_build_array('Nearby healthcare and retail anchors are shown when sourced'),
      'negative_factors', jsonb_build_array('Nearby pharmacy competition is shown when sourced'),
      'limitations', jsonb_build_array(
        'SA2 population is area context rather than a pharmacy catchment estimate',
        'Age, disability, SEIFA and vehicle-access adjustments have no imported coverage in v1',
        'Experimental annual demand assumption is not calibrated to actual pharmacy volumes'
      ),
      'assumptions', jsonb_build_object(
        'annual_prescription_demand_per_person',15,
        'annual_to_daily_divisor',365,
        'competition_share','equal base share among sourced pharmacies within 2 km, widened uncertainty',
        'status','experimental and versioned, not validated'
      )
    )
  FROM public.pharmacy_premises p
  CROSS JOIN public.dispensing_potential_methods m
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.pharmacy_premises q WHERE q.id<>p.id AND q.location IS NOT NULL AND ST_DWithin(q.location,p.location,500))::INTEGER pharmacies_500m,
      (SELECT count(*) FROM public.pharmacy_premises q WHERE q.id<>p.id AND q.location IS NOT NULL AND ST_DWithin(q.location,p.location,1000))::INTEGER pharmacies_1km,
      (SELECT count(*) FROM public.pharmacy_premises q WHERE q.id<>p.id AND q.location IS NOT NULL AND ST_DWithin(q.location,p.location,2000))::INTEGER pharmacies_2km,
      (SELECT count(*) FROM public.pharmacy_premises q WHERE q.id<>p.id AND q.location IS NOT NULL AND ST_DWithin(q.location,p.location,5000))::INTEGER pharmacies_5km,
      (SELECT min(ST_Distance(q.location,p.location)) FROM public.pharmacy_premises q WHERE q.id<>p.id AND q.location IS NOT NULL) nearest_competitor_m,
      (SELECT sum(1.0/greatest(ST_Distance(q.location,p.location),100)) FROM public.pharmacy_premises q WHERE q.id<>p.id AND q.location IS NOT NULL AND ST_DWithin(q.location,p.location,5000)) weighted_competition,
      (SELECT count(*) FROM public.medical_centres q WHERE ST_DWithin(q.location,p.location,500))::INTEGER medical_500m,
      (SELECT count(*) FROM public.medical_centres q WHERE ST_DWithin(q.location,p.location,1000))::INTEGER medical_1km,
      (SELECT count(*) FROM public.medical_centres q WHERE ST_DWithin(q.location,p.location,2000))::INTEGER medical_2km,
      (SELECT count(*) FROM public.supermarkets q WHERE ST_DWithin(q.location,p.location,500))::INTEGER supermarkets_500m,
      (SELECT count(*) FROM public.supermarkets q WHERE ST_DWithin(q.location,p.location,1000))::INTEGER supermarkets_1km,
      (SELECT count(*) FROM public.supermarkets q WHERE ST_DWithin(q.location,p.location,2000))::INTEGER supermarkets_2km
  ) nearby
  LEFT JOIN LATERAL (
    SELECT a.population_2024,a.population_density_2024,a.annual_growth_percent
    FROM public.dispensing_population_areas a
    WHERE ST_Intersects(a.boundary,p.location::geometry)
    ORDER BY a.sa2_code_2021 LIMIT 1
  ) pop ON true
  WHERE m.version='gdp-v1.0.0' AND p.location IS NOT NULL
  ON CONFLICT (pharmacy_id,method_id) DO UPDATE SET
    calculated_at=excluded.calculated_at, raw_metrics=excluded.raw_metrics,
    component_scores=excluded.component_scores, missing_inputs=excluded.missing_inputs,
    warnings=excluded.warnings, evidence_confidence=excluded.evidence_confidence,
    relative_score=excluded.relative_score, explanation=excluded.explanation;
  GET DIAGNOSTICS affected = ROW_COUNT;
  UPDATE public.pharmacy_dispensing_potential d
  SET victorian_percentile = ranked.percentile
  FROM (
    SELECT pharmacy_id, method_id,
      round((percent_rank() OVER (PARTITION BY method_id ORDER BY relative_score) * 100)::numeric, 1) percentile
    FROM public.pharmacy_dispensing_potential WHERE relative_score IS NOT NULL
  ) ranked
  WHERE d.pharmacy_id=ranked.pharmacy_id AND d.method_id=ranked.method_id;
  UPDATE public.pharmacy_dispensing_potential d SET
    experimental_scripts_day_equivalent = round((
      (raw_metrics->>'surrounding_population_sa2_2024')::numeric * 15 / 365
      / greatest(1, ((raw_metrics->>'pharmacies_2km')::numeric + 1))
      * (1 + least(0.20, ((raw_metrics->>'medical_centres_1km')::numeric * 0.02)))
    ),0),
    theoretical_scripts_day_low = round((
      (raw_metrics->>'surrounding_population_sa2_2024')::numeric * 15 / 365
      / greatest(1, ((raw_metrics->>'pharmacies_2km')::numeric + 1)) * 0.50
    ),0),
    theoretical_scripts_day_high = round((
      (raw_metrics->>'surrounding_population_sa2_2024')::numeric * 15 / 365
      / greatest(1, ((raw_metrics->>'pharmacies_2km')::numeric + 1)) * 1.50
    ),0),
    scripts_day_status =
      'Experimental geographic estimate; not actual dispensing volume; not adequately calibrated'
  WHERE raw_metrics->>'surrounding_population_sa2_2024' IS NOT NULL;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_dispensing_potential_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_dispensing_potential_v1() TO service_role;

COMMENT ON TABLE public.pharmacy_dispensing_potential IS
  'Geographic Dispensing Potential: explainable relative screening only, not actual dispensing volume.';
