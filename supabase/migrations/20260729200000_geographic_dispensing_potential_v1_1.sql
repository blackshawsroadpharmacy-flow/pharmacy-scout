-- WP23: GDP v1.1 alongside immutable v1.0 evidence.
-- Still an assumption-based relative screen, not a fitted or validated predictive model.

ALTER TABLE public.dispensing_potential_methods ADD COLUMN IF NOT EXISTS rationale TEXT;
ALTER TABLE public.dispensing_potential_methods ADD COLUMN IF NOT EXISTS implemented_at TIMESTAMPTZ;
ALTER TABLE public.dispensing_potential_methods ADD COLUMN IF NOT EXISTS implemented_by TEXT;

CREATE TABLE public.dispensing_potential_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id UUID NOT NULL REFERENCES public.dispensing_potential_methods(id),
  assumption_key TEXT NOT NULL,
  assumption_value JSONB NOT NULL,
  unit TEXT,
  rationale TEXT NOT NULL,
  implemented_at TIMESTAMPTZ NOT NULL,
  implemented_by TEXT NOT NULL,
  UNIQUE(method_id,assumption_key)
);
ALTER TABLE public.dispensing_potential_assumptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dispensing_potential_assumptions TO anon,authenticated;
CREATE POLICY public_reads_gdp_assumptions ON public.dispensing_potential_assumptions
  FOR SELECT TO anon,authenticated USING (true);

UPDATE public.dispensing_potential_methods SET active=false WHERE version='gdp-v1.0.0';
INSERT INTO public.dispensing_potential_methods(
  id,version,label,weights,minimum_calibration_observations,validation_requirements,active,
  rationale,implemented_at,implemented_by
) VALUES (
  '23000000-0000-4000-8000-000000000001','gdp-v1.1.0',
  'Geographic Dispensing Potential v1.1',
  '{"demand_pressure":0.30,"competitive_position":0.25,"healthcare_anchors":0.25,"retail_anchors":0.10,"growth_outlook":0.10}',
  10,
  '{"calibration_status":"not adequately calibrated","predictive_claims":false,"fitting":"disabled below 10 genuine pharmacies","required_before_accuracy_claim":"documented diverse sample plus holdout or cross-validation error"}',
  true,
  'Adds official 2021 demographic and 2025 residential aged-care context while preserving v1.0. More variables do not imply validation.',
  '2026-07-29T05:15:00Z','system:wp23'
) ON CONFLICT (version) DO NOTHING;

INSERT INTO public.dispensing_potential_assumptions(
  method_id,assumption_key,assumption_value,unit,rationale,implemented_at,implemented_by
) SELECT m.id,v.key,v.value,v.unit,v.rationale,'2026-07-29T05:15:00Z','system:wp23'
FROM public.dispensing_potential_methods m
CROSS JOIN (VALUES
  ('component_weights','{"demand_pressure":0.30,"competitive_position":0.25,"healthcare_anchors":0.25,"retail_anchors":0.10,"growth_outlook":0.10}'::jsonb,NULL,'Confidence never inflates potential; weights combine separately sourced components'),
  ('distance_decay','{"pharmacy_floor_m":100,"competition_radius_m":5000,"aged_care_primary_radius_m":2000}'::jsonb,'metres','Retains v1 competition decay and limits aged-care weighting to nearby published anchors'),
  ('population_demand','{"annual_prescriptions_per_person":15}'::jsonb,'experimental annual equivalent','Uncalibrated commercial-screening assumption retained from v1'),
  ('age_adjustments','{"age65_percent_centre":18,"age75_percent_centre":9,"maximum_score_adjustment":12}'::jsonb,'percentage points','Transparent relative area context, not individual demand'),
  ('healthcare_adjustments','{"approved_places_per_index_point":50,"maximum_aged_care_adjustment":20,"hospital_adjustment":null}'::jsonb,'published places','Hospital adjustment is disabled while authoritative statewide coverage is unavailable'),
  ('retail_adjustments','{"supermarket_1km_points_each":20,"maximum":100}'::jsonb,'score points','Retains v1 retail anchor interpretation'),
  ('annual_to_daily_conversion','{"divisor":365}'::jsonb,'days','Produces an experimental daily equivalent, not trading-day actual volume'),
  ('trading_day_assumption','{"days_per_week":7}'::jsonb,'days','Geographic demand is spread over a full week; actual trading patterns remain calibration metadata'),
  ('uncertainty_multipliers','{"high":[0.65,1.35],"medium":[0.50,1.50],"low":[0.35,1.75]}'::jsonb,'range multiplier','Lower evidence confidence widens, but never increases, central potential'),
  ('low_confidence_widening','{"missing_demographics":true,"missing_hospitals":true,"coordinate_quality":true,"source_age":true}'::jsonb,NULL,'Makes evidence limitations visible in range width and ranking eligibility')
) AS v(key,value,unit,rationale)
WHERE m.version='gdp-v1.1.0'
ON CONFLICT (method_id,assumption_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_dispensing_potential_v1_1()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected INTEGER;
BEGIN
  WITH source AS (
    SELECT old.*,demo.context demographic,demo.coverage_quality,
      old.healthcare_anchor_evidence healthcare,
      CASE WHEN demo.coverage_quality='complete' THEN 85
        WHEN demo.coverage_quality='partial' THEN 65 ELSE 35 END
      + CASE WHEN old.raw_metrics->>'pharmacy_coordinate_quality' IN ('address','rooftop','parcel') THEN 10 ELSE 0 END
      - CASE WHEN old.healthcare_anchor_evidence IS NULL THEN 15 ELSE 0 END AS confidence_score
    FROM public.pharmacy_dispensing_potential old
    JOIN public.dispensing_potential_methods old_method ON old_method.id=old.method_id
    LEFT JOIN public.pharmacy_demographic_context demo ON demo.pharmacy_id=old.pharmacy_id
    WHERE old_method.version='gdp-v1.0.0'
  ), scored AS (
    SELECT s.*,
      least(100,greatest(0,
        coalesce((s.component_scores->>'demand_pressure')::numeric,50)
        + coalesce(((s.demographic->>'age_65_plus_percent')::numeric-18)*0.8,0)
        + coalesce(((s.demographic->>'age_75_plus_percent')::numeric-9)*0.5,0)
        + coalesce(((s.demographic->>'need_assistance_percent')::numeric-6)*0.4,0)
      )) demand_score,
      least(100,greatest(0,
        coalesce((s.component_scores->>'healthcare_anchors')::numeric,0)
        + least(20,coalesce((s.healthcare->>'approved_places_2km')::numeric,0)/50)
      )) healthcare_score
    FROM source s
  ), final AS (
    SELECT scored.*,
      round(
        demand_score*0.30
        + coalesce((component_scores->>'competitive_position')::numeric,0)*0.25
        + healthcare_score*0.25
        + coalesce((component_scores->>'retail_anchors')::numeric,0)*0.10
        + coalesce((component_scores->>'growth_outlook')::numeric,0)*0.10,2
      ) new_score,
      CASE WHEN confidence_score>=80 THEN 'high'
        WHEN confidence_score>=55 THEN 'medium' ELSE 'low' END new_confidence
    FROM scored
  )
  INSERT INTO public.pharmacy_dispensing_potential(
    pharmacy_id,method_id,calculated_at,raw_metrics,component_scores,missing_inputs,warnings,
    evidence_confidence,relative_score,peer_group,explanation,
    experimental_scripts_day_equivalent,theoretical_scripts_day_low,
    theoretical_scripts_day_high,scripts_day_status
  )
  SELECT f.pharmacy_id,m.id,now(),
    f.raw_metrics || jsonb_build_object(
      'official_demographic_context',f.demographic,
      'official_healthcare_anchor_context',f.healthcare,
      'demographic_coverage_percentage',CASE f.coverage_quality
        WHEN 'complete' THEN 100 WHEN 'partial' THEN 70 ELSE 0 END,
      'evidence_confidence_score',greatest(0,least(100,f.confidence_score)),
      'calibration_sample_size',(SELECT count(DISTINCT pharmacy_id)
        FROM public.dispensing_calibration_observations WHERE review_status='verified')
    ),
    f.component_scores || jsonb_build_object(
      'demand_pressure',f.demand_score,'healthcare_anchors',f.healthcare_score
    ),
    array_remove(ARRAY[
      CASE WHEN f.coverage_quality IS DISTINCT FROM 'complete' THEN 'complete_demographic_coverage' END,
      'authoritative_statewide_hospital_coverage',
      CASE WHEN f.healthcare IS NULL THEN 'healthcare_anchor_coverage' END
    ],NULL),
    array_append(f.warnings,
      'GDP v1.1 has more sourced variables but is not validated for predictive accuracy'),
    f.new_confidence,f.new_score,f.peer_group,
    jsonb_build_object(
      'positive_factors',jsonb_build_array(
        'Official age, assistance and aged-care context is included where sourced'),
      'negative_factors',jsonb_build_array(
        'Pharmacy competition and missing authoritative hospital coverage limit interpretation'),
      'limitations',jsonb_build_array(
        'SA2 averages are not pharmacy catchments',
        'Published residential places are not occupied beds or guaranteed prescription demand',
        'The model is assumption-based and not adequately calibrated'),
      'changed_inputs',jsonb_build_array(
        'ABS 2021 age 65+, age 75+, need for assistance, SEIFA and vehicle access',
        'Australian Government 2025 residential aged-care facilities and published places'),
      'changed_assumptions',jsonb_build_array(
        'Component weights changed','Confidence-specific uncertainty multipliers added')
    ),
    f.experimental_scripts_day_equivalent,
    CASE f.new_confidence
      WHEN 'high' THEN round(f.experimental_scripts_day_equivalent*0.65,0)
      WHEN 'medium' THEN round(f.experimental_scripts_day_equivalent*0.50,0)
      ELSE round(f.experimental_scripts_day_equivalent*0.35,0) END,
    CASE f.new_confidence
      WHEN 'high' THEN round(f.experimental_scripts_day_equivalent*1.35,0)
      WHEN 'medium' THEN round(f.experimental_scripts_day_equivalent*1.50,0)
      ELSE round(f.experimental_scripts_day_equivalent*1.75,0) END,
    'Experimental geographic estimate; not actual dispensing volume; not adequately calibrated'
  FROM final f CROSS JOIN public.dispensing_potential_methods m
  WHERE m.version='gdp-v1.1.0'
  ON CONFLICT (pharmacy_id,method_id) DO UPDATE SET
    calculated_at=EXCLUDED.calculated_at,raw_metrics=EXCLUDED.raw_metrics,
    component_scores=EXCLUDED.component_scores,missing_inputs=EXCLUDED.missing_inputs,
    warnings=EXCLUDED.warnings,evidence_confidence=EXCLUDED.evidence_confidence,
    relative_score=EXCLUDED.relative_score,peer_group=EXCLUDED.peer_group,
    explanation=EXCLUDED.explanation,
    experimental_scripts_day_equivalent=EXCLUDED.experimental_scripts_day_equivalent,
    theoretical_scripts_day_low=EXCLUDED.theoretical_scripts_day_low,
    theoretical_scripts_day_high=EXCLUDED.theoretical_scripts_day_high,
    scripts_day_status=EXCLUDED.scripts_day_status;
  GET DIAGNOSTICS affected=ROW_COUNT;

  UPDATE public.pharmacy_dispensing_potential p SET victorian_percentile=r.percentile
  FROM (
    SELECT pharmacy_id,method_id,
      round((percent_rank() OVER (PARTITION BY method_id ORDER BY relative_score)*100)::numeric,0) percentile
    FROM public.pharmacy_dispensing_potential
  ) r WHERE p.pharmacy_id=r.pharmacy_id AND p.method_id=r.method_id;
  UPDATE public.pharmacy_dispensing_potential p SET peer_percentile=r.percentile
  FROM (
    SELECT pharmacy_id,method_id,
      round((percent_rank() OVER (PARTITION BY method_id,peer_group ORDER BY relative_score)*100)::numeric,0) percentile
    FROM public.pharmacy_dispensing_potential WHERE peer_group IS NOT NULL
  ) r WHERE p.pharmacy_id=r.pharmacy_id AND p.method_id=r.method_id;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_dispensing_potential_v1_1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dispensing_potential_v1_1() TO service_role;

CREATE VIEW public.dispensing_potential_model_comparison
WITH (security_invoker=true) AS
SELECT newer.pharmacy_id,
  old_method.version old_version,new_method.version new_version,
  old.relative_score old_score,newer.relative_score new_score,
  newer.relative_score-old.relative_score score_change,
  old.victorian_percentile old_percentile,newer.victorian_percentile new_percentile,
  old.theoretical_scripts_day_low old_range_low,old.theoretical_scripts_day_high old_range_high,
  newer.theoretical_scripts_day_low new_range_low,newer.theoretical_scripts_day_high new_range_high,
  old.evidence_confidence old_confidence,newer.evidence_confidence new_confidence,
  newer.explanation->'changed_inputs' changed_inputs,
  newer.explanation->'changed_assumptions' changed_assumptions,
  CASE
    WHEN newer.component_scores->>'healthcare_anchors' IS DISTINCT FROM
      old.component_scores->>'healthcare_anchors' THEN 'New official healthcare-anchor evidence'
    WHEN newer.component_scores->>'demand_pressure' IS DISTINCT FROM
      old.component_scores->>'demand_pressure' THEN 'New official demographic evidence'
    ELSE 'Model assumptions and confidence framework changed' END main_reason
FROM public.pharmacy_dispensing_potential newer
JOIN public.dispensing_potential_methods new_method ON new_method.id=newer.method_id
JOIN public.pharmacy_dispensing_potential old ON old.pharmacy_id=newer.pharmacy_id
JOIN public.dispensing_potential_methods old_method ON old_method.id=old.method_id
WHERE new_method.version='gdp-v1.1.0' AND old_method.version='gdp-v1.0.0';
GRANT SELECT ON public.dispensing_potential_model_comparison TO anon,authenticated;

DO $$
BEGIN
  SET LOCAL statement_timeout = '120s';
  PERFORM public.refresh_dispensing_potential_v1_1();
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'GDP v1.1 refresh failed: %', SQLERRM;
END;
$$;
