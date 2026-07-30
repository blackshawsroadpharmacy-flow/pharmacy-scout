BEGIN;
SELECT plan(10);

INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, premises_source
) VALUES (
  'a7000000-0000-4000-8000-000000000001', 'Licensee Fixture',
  '1 Licensee Street', 'Melbourne', '3000', 'vpa_register'
);
INSERT INTO public.pharmacy_premises_licensees (
  id, premises_id, vpa_record_key, vpa_premises_name, licensee_name,
  first_observed_at, last_seen_at, currently_observed
) VALUES (
  'a7100000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'licensee-fixture', 'Licensee Fixture', 'Example & Co.',
  '2026-07-01', '2026-07-10', true
);
SELECT is((SELECT count(*)::integer FROM public.vpa_published_licensees), 1,
  'first observation creates one published-licensee entity');
SELECT is((SELECT count(*)::integer FROM public.vpa_published_licensee_relationships
  WHERE currently_observed), 1, 'first relationship is current');

UPDATE public.pharmacy_premises_licensees
SET last_seen_at = '2026-07-11'
WHERE id = 'a7100000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::integer FROM public.vpa_published_licensees), 1,
  'repeated identical observation remains idempotent');

UPDATE public.pharmacy_premises_licensees
SET licensee_name = 'Example & Co', last_seen_at = '2026-07-12'
WHERE id = 'a7100000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::integer FROM public.vpa_published_licensees), 1,
  'equivalent normalised spelling retains one entity');

UPDATE public.pharmacy_premises_licensees
SET licensee_name = 'New Published Licensee', last_seen_at = '2026-07-20'
WHERE id = 'a7100000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::integer FROM public.vpa_published_licensees), 2,
  'genuine name change creates a new entity');
SELECT is((SELECT count(*)::integer
  FROM public.vpa_published_licensee_relationships AS relationship
  JOIN public.vpa_published_licensees AS entity
    ON entity.id = relationship.published_licensee_id
  WHERE entity.normalised_comparison_name = 'example co'
    AND NOT relationship.currently_observed), 1,
  'old relationship is retired');
SELECT is((SELECT count(*)::integer
  FROM public.vpa_published_licensee_relationships AS relationship
  JOIN public.vpa_published_licensees AS entity
    ON entity.id = relationship.published_licensee_id
  WHERE entity.normalised_comparison_name = 'new published licensee'
    AND relationship.currently_observed), 1,
  'new relationship is active');
SELECT is((SELECT current_premises_count::integer
  FROM public.vpa_published_licensee_networks
  WHERE normalised_comparison_name = 'example co'), 0,
  'old entity no longer inflates current-premises counts');
SELECT is((SELECT historical_premises_count::integer
  FROM public.vpa_published_licensee_networks
  WHERE normalised_comparison_name = 'example co'), 1,
  'old relationship remains in historical counts');

UPDATE public.pharmacy_premises_licensees
SET licensee_name = 'Older Spelling', last_seen_at = '2026-07-05',
    currently_observed = false
WHERE id = 'a7100000-0000-4000-8000-000000000001';
SELECT is((SELECT published_display_name
  FROM public.vpa_published_licensees
  WHERE normalised_comparison_name = 'new published licensee'),
  'New Published Licensee',
  'older observation cannot overwrite newer published identity state');

SELECT * FROM finish();
ROLLBACK;
