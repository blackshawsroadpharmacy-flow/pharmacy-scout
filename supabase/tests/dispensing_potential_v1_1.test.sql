BEGIN;
SELECT plan(10);
SELECT is(
  (SELECT count(*) FROM public.dispensing_potential_methods WHERE version='gdp-v1.1.0'),
  1::bigint,'v1.1 method exists'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_potential_methods WHERE version='gdp-v1.0.0'),
  1::bigint,'v1.0 method remains available'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_potential_methods WHERE active),
  1::bigint,'exactly one GDP method is active'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_potential_assumptions
    WHERE method_id=(SELECT id FROM public.dispensing_potential_methods WHERE version='gdp-v1.1.0')),
  10::bigint,'all ten documented v1.1 assumptions exist'
);
SELECT ok(
  (SELECT count(*) FROM public.pharmacy_dispensing_potential p
   JOIN public.dispensing_potential_methods m ON m.id=p.method_id
   WHERE m.version='gdp-v1.1.0') > 0,
  'v1.1 results are calculated'
);
SELECT ok(
  (SELECT count(*) FROM public.dispensing_potential_model_comparison) > 0,
  'old/new comparisons are available'
);
SELECT is(
  (SELECT minimum_calibration_observations FROM public.dispensing_potential_methods
   WHERE version='gdp-v1.1.0'),10,'fitting threshold remains ten genuine pharmacies'
);
SELECT ok(
  (SELECT validation_requirements->>'predictive_claims' FROM public.dispensing_potential_methods
   WHERE version='gdp-v1.1.0')::boolean=false,
  'predictive claims remain disabled'
);
SELECT ok(
  (SELECT bool_and(theoretical_scripts_day_low <= experimental_scripts_day_equivalent
    AND theoretical_scripts_day_high >= experimental_scripts_day_equivalent)
   FROM public.pharmacy_dispensing_potential p
   JOIN public.dispensing_potential_methods m ON m.id=p.method_id
   WHERE m.version='gdp-v1.1.0'),
  'uncertainty ranges contain the central experimental equivalent'
);
SELECT is(
  (SELECT count(*) FROM public.dispensing_calibration_observations),
  0::bigint,'no calibration observations are fabricated'
);
SELECT * FROM finish();
ROLLBACK;
