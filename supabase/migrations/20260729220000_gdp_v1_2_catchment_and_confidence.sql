-- Audit remediation F-04, F-05, F-06, F-23e.
--
-- Ships as gdp-v1.2.0 alongside the immutable v1.0 and v1.1 rows, per the
-- existing versioning design. Nothing about v1.0/v1.1 is mutated.
--
-- F-04 v1.1 copied experimental_scripts_day_equivalent verbatim from v1.0, so
--      new demographic and aged-care evidence moved the score but had zero
--      effect on the headline volume estimate (922/922 identical).
-- F-05 The estimate attributed a whole SA2's population to pharmacies inside a
--      2 km radius — mismatched geographies producing a 1,454/day maximum and
--      25% of the state above 300/day. Population is now apportioned by the
--      share of the SA2 that the catchment actually covers.
-- F-06 98.4% of pharmacies were labelled "high" evidence confidence while
--      every row carried a permanently missing input. Confidence is now capped
--      while authoritative statewide hospital coverage is unavailable.
-- F-23e peer_percentile left stale values on rows with a null peer_group.

INSERT INTO public.dispensing_potential_methods (
  id, version, label, weights, minimum_calibration_observations,
  validation_requirements, active, rationale, implemented_at, implemented_by
) VALUES (
  '24000000-0000-4000-8000-000000000001',
  'gdp-v1.2.0',
  'Geographic Dispensing Potential v1.2',
  '{"demand_pressure":0.30,"competitive_position":0.25,"healthcare_anchors":0.25,"retail_anchors":0.10,"growth_outlook":0.10}',
  10,
  '{"calibration_status":"not adequately calibrated","predictive_claims":false,"fitting":"disabled below 10 genuine pharmacies","required_before_accuracy_claim":"documented diverse sample plus holdout or cross-validation error"}',
  false,
  'Apportions SA2 population to the modelled catchment instead of assigning it whole, recomputes the daily equivalent from v1.2 inputs, and caps evidence confidence while statewide hospital coverage is missing.',
  '2026-07-29T12:00:00Z', 'system:audit-remediation'
) ON CONFLICT (version) DO NOTHING;

INSERT INTO public.dispensing_potential_assumptions (
  method_id, assumption_key, assumption_value, unit, rationale, implemented_at, implemented_by
) SELECT m.id, v.key, v.value, v.unit, v.rationale,
       '2026-07-29T12:00:00Z', 'system:audit-remediation'
FROM public.dispensing_potential_methods m
CROSS JOIN (VALUES
  ('catchment_radius_m', '{"radius_m":2000}'::jsonb, 'metres',
   'Population, competition and anchors are all measured over the same radius; v1.0/v1.1 mixed whole-SA2 population with a 2 km competitor count'),
  ('population_apportionment', '{"method":"area_share_of_intersecting_sa2s"}'::jsonb, NULL,
   'Each intersecting SA2 contributes population in proportion to the catchment area it covers, rather than contributing its entire population'),
  ('population_demand', '{"annual_prescriptions_per_person":15}'::jsonb, 'experimental annual equivalent',
   'Uncalibrated commercial-screening assumption retained from v1 for comparability'),
  ('confidence_cap', '{"cap_while_hospital_coverage_missing":"medium"}'::jsonb, NULL,
   'A permanently missing authoritative input must not be compatible with a high confidence label'),
  ('uncertainty_multipliers', '{"high":[0.65,1.35],"medium":[0.50,1.50],"low":[0.35,1.75]}'::jsonb, 'range multiplier',
   'Lower evidence confidence widens, but never increases, central potential')
) AS v(key, value, unit, rationale)
WHERE m.version = 'gdp-v1.2.0'
ON CONFLICT (method_id, assumption_key) DO NOTHING;

-- ============================================================
-- F-05: area-apportioned catchment population
-- ============================================================
CREATE OR REPLACE FUNCTION public.catchment_population(
  _location GEOGRAPHY, _radius_m INTEGER DEFAULT 2000
) RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH catchment AS (
    SELECT ST_Buffer(_location, _radius_m)::geometry AS geom
  )
  SELECT COALESCE(SUM(
    a.population_2024
      * (ST_Area(ST_Intersection(a.boundary, c.geom)::geography)
         / NULLIF(ST_Area(a.boundary::geography), 0))
  ), 0)
  FROM public.dispensing_population_areas a
  CROSS JOIN catchment c
  WHERE a.population_2024 IS NOT NULL
    AND ST_Intersects(a.boundary, c.geom);
$$;
REVOKE ALL ON FUNCTION public.catchment_population(GEOGRAPHY, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catchment_population(GEOGRAPHY, INTEGER) TO service_role;

COMMENT ON FUNCTION public.catchment_population(GEOGRAPHY, INTEGER) IS
  'Population within a radius, apportioned by the share of each intersecting SA2 the catchment covers. Not a residency count.';

-- ============================================================
-- v1.2 refresh
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_dispensing_potential_v1_2()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INTEGER;
BEGIN
  WITH source AS (
    SELECT
      prev.*,
      p.location,
      demo.context AS demographic,
      demo.coverage_quality,
      prev.healthcare_anchor_evidence AS healthcare,
      public.catchment_population(p.location, 2000) AS catchment_pop,
      -- F-06: complete demographics alone previously reached the "high"
      -- threshold. Statewide hospital coverage is still unavailable for every
      -- row, so confidence is capped at medium until that source exists.
      least(
        74,
        CASE WHEN demo.coverage_quality = 'complete' THEN 70
             WHEN demo.coverage_quality = 'partial' THEN 55
             ELSE 30 END
        + CASE WHEN prev.raw_metrics->>'pharmacy_coordinate_quality'
                    IN ('address','rooftop','parcel') THEN 8 ELSE 0 END
        - CASE WHEN prev.healthcare_anchor_evidence IS NULL THEN 15 ELSE 0 END
      ) AS confidence_score
    FROM public.pharmacy_dispensing_potential prev
    JOIN public.dispensing_potential_methods prev_method ON prev_method.id = prev.method_id
    JOIN public.pharmacy_premises p ON p.id = prev.pharmacy_id
    LEFT JOIN public.pharmacy_demographic_context demo ON demo.pharmacy_id = prev.pharmacy_id
    WHERE prev_method.version = 'gdp-v1.1.0' AND p.location IS NOT NULL
  ), scored AS (
    SELECT s.*,
      least(100, greatest(0,
        coalesce((s.component_scores->>'demand_pressure')::numeric, 50)
        + coalesce(((s.demographic->>'age_65_plus_percent')::numeric - 18) * 0.8, 0)
        + coalesce(((s.demographic->>'age_75_plus_percent')::numeric - 9) * 0.5, 0)
        + coalesce(((s.demographic->>'need_assistance_percent')::numeric - 6) * 0.4, 0)
      )) AS demand_score,
      least(100, greatest(0,
        coalesce((s.component_scores->>'healthcare_anchors')::numeric, 0)
        + least(20, coalesce((s.healthcare->>'approved_places_2km')::numeric, 0) / 50)
      )) AS healthcare_score,
      CASE WHEN s.confidence_score >= 55 THEN 'medium' ELSE 'low' END AS new_confidence,
      -- F-04: recomputed from v1.2 inputs rather than copied forward.
      round(
        s.catchment_pop * 15 / 365
        / greatest(1, coalesce((s.raw_metrics->>'pharmacies_2km')::numeric, 0) + 1)
        * (1 + least(0.20, coalesce((s.raw_metrics->>'medical_centres_1km')::numeric, 0) * 0.02))
      , 0) AS new_scripts_day
    FROM source s
  )
  INSERT INTO public.pharmacy_dispensing_potential (
    pharmacy_id, method_id, calculated_at, raw_metrics, component_scores, missing_inputs,
    warnings, evidence_confidence, relative_score, peer_group, explanation,
    experimental_scripts_day_equivalent, theoretical_scripts_day_low,
    theoretical_scripts_day_high, scripts_day_status
  )
  SELECT f.pharmacy_id, m.id, now(),
    f.raw_metrics || jsonb_build_object(
      'catchment_population_2km', round(f.catchment_pop, 0),
      'catchment_radius_m', 2000,
      'population_apportionment', 'area_share_of_intersecting_sa2s',
      'evidence_confidence_score', f.confidence_score
    ),
    f.component_scores || jsonb_build_object(
      'demand_pressure', f.demand_score, 'healthcare_anchors', f.healthcare_score
    ),
    array_remove(ARRAY[
      CASE WHEN f.coverage_quality IS DISTINCT FROM 'complete' THEN 'complete_demographic_coverage' END,
      'authoritative_statewide_hospital_coverage',
      CASE WHEN f.healthcare IS NULL THEN 'healthcare_anchor_coverage' END
    ], NULL),
    ARRAY[
      'Catchment population is apportioned area share, not a residency or customer count',
      'Confidence is capped at medium while authoritative statewide hospital coverage is unavailable',
      'GDP v1.2 is assumption-based and not validated for predictive accuracy'
    ],
    f.new_confidence,
    round(
      f.demand_score * 0.30
      + coalesce((f.component_scores->>'competitive_position')::numeric, 0) * 0.25
      + f.healthcare_score * 0.25
      + coalesce((f.component_scores->>'retail_anchors')::numeric, 0) * 0.10
      + coalesce((f.component_scores->>'growth_outlook')::numeric, 0) * 0.10
    , 2),
    f.peer_group,
    jsonb_build_object(
      'positive_factors', jsonb_build_array(
        'Catchment population now matches the radius used for competition and anchors'),
      'negative_factors', jsonb_build_array(
        'Pharmacy competition and missing authoritative hospital coverage limit interpretation'),
      'limitations', jsonb_build_array(
        'Area-apportioned SA2 population is not a pharmacy catchment measurement',
        'Published residential places are not occupied beds or guaranteed prescription demand',
        'The model is assumption-based and not adequately calibrated'),
      'changed_inputs', jsonb_build_array(
        'SA2 population apportioned by catchment area share instead of assigned whole'),
      'changed_assumptions', jsonb_build_array(
        'Daily equivalent recomputed from v1.2 inputs rather than inherited from v1.0',
        'Evidence confidence capped at medium while hospital coverage is missing')
    ),
    f.new_scripts_day,
    CASE f.new_confidence
      WHEN 'medium' THEN round(f.new_scripts_day * 0.50, 0)
      ELSE round(f.new_scripts_day * 0.35, 0) END,
    CASE f.new_confidence
      WHEN 'medium' THEN round(f.new_scripts_day * 1.50, 0)
      ELSE round(f.new_scripts_day * 1.75, 0) END,
    'Experimental geographic estimate; not actual dispensing volume; not adequately calibrated'
  FROM scored f CROSS JOIN public.dispensing_potential_methods m
  WHERE m.version = 'gdp-v1.2.0'
  ON CONFLICT (pharmacy_id, method_id) DO UPDATE SET
    calculated_at = EXCLUDED.calculated_at, raw_metrics = EXCLUDED.raw_metrics,
    component_scores = EXCLUDED.component_scores, missing_inputs = EXCLUDED.missing_inputs,
    warnings = EXCLUDED.warnings, evidence_confidence = EXCLUDED.evidence_confidence,
    relative_score = EXCLUDED.relative_score, peer_group = EXCLUDED.peer_group,
    explanation = EXCLUDED.explanation,
    experimental_scripts_day_equivalent = EXCLUDED.experimental_scripts_day_equivalent,
    theoretical_scripts_day_low = EXCLUDED.theoretical_scripts_day_low,
    theoretical_scripts_day_high = EXCLUDED.theoretical_scripts_day_high,
    scripts_day_status = EXCLUDED.scripts_day_status;
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.pharmacy_dispensing_potential p SET victorian_percentile = r.percentile
  FROM (
    SELECT pharmacy_id, method_id,
      round((percent_rank() OVER (PARTITION BY method_id ORDER BY relative_score) * 100)::numeric, 1) AS percentile
    FROM public.pharmacy_dispensing_potential WHERE relative_score IS NOT NULL
  ) r WHERE p.pharmacy_id = r.pharmacy_id AND p.method_id = r.method_id;

  -- F-23e: clear stale peer percentiles before recomputing, so rows that lost
  -- their peer group do not keep a value from an earlier run.
  UPDATE public.pharmacy_dispensing_potential SET peer_percentile = NULL
  WHERE peer_group IS NULL AND peer_percentile IS NOT NULL;
  UPDATE public.pharmacy_dispensing_potential p SET peer_percentile = r.percentile
  FROM (
    SELECT pharmacy_id, method_id,
      round((percent_rank() OVER (PARTITION BY method_id, peer_group ORDER BY relative_score) * 100)::numeric, 1) AS percentile
    FROM public.pharmacy_dispensing_potential
    WHERE relative_score IS NOT NULL AND peer_group IS NOT NULL
  ) r WHERE p.pharmacy_id = r.pharmacy_id AND p.method_id = r.method_id;

  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_dispensing_potential_v1_2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dispensing_potential_v1_2() TO service_role;

-- Populate v1.2 rows. v1.2 is left inactive: activate it deliberately after
-- reviewing the recomputed distribution against the v1.1 baseline.
DO $$
BEGIN
  PERFORM public.refresh_dispensing_potential_v1_2();
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'GDP v1.2 refresh failed: % (%)', SQLERRM, SQLSTATE;
END;
$$;
