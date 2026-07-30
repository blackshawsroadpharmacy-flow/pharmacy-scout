BEGIN;
SELECT plan(18);

INSERT INTO public.pharmacy_premises (
  id, name, address, suburb, postcode, location, premises_source,
  vpa_registration_status_normalised
)
SELECT
  ('e1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  initcap(status) || ' Fixture', n || ' Lifecycle Street', 'Melbourne', '3000',
  ST_SetSRID(ST_MakePoint(144.90 + n / 1000.0, -37.80), 4326)::geography,
  'vpa_register', status
FROM (VALUES
  (1, 'active'), (2, 'unknown'), (3, 'review_required'), (4, 'closed'),
  (5, 'inactive'), (6, 'suspended'), (7, 'cancelled')
) AS fixtures(n, status);

SELECT ok(public.vpa_in_default_active_map('active', NULL, NULL),
  'active is on the default active map');
SELECT ok(public.vpa_in_default_active_map('unknown', NULL, NULL),
  'never-closed unknown is on the default active map');
SELECT ok(public.vpa_in_default_active_map('review_required', NULL, NULL),
  'never-closed review-required is on the default active map');
SELECT ok(NOT public.vpa_in_default_active_map('closed', now(), NULL),
  'closed is excluded');
SELECT ok(NOT public.vpa_in_default_active_map('inactive', NULL, NULL),
  'inactive is excluded');
SELECT ok(NOT public.vpa_in_default_active_map('suspended', NULL, NULL),
  'suspended is excluded');
SELECT ok(NOT public.vpa_in_default_active_map('cancelled', NULL, NULL),
  'cancelled is excluded');
SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_points_in_viewport(
    144.8, -37.9, 145.1, -37.7, false, false, 100
  ) WHERE id::text LIKE 'e1000000-0000-4000-8000-%'),
  3,
  'viewport uses the same authoritative active-map predicate'
);

UPDATE public.pharmacy_premises
SET vpa_registered_until = '2020-01-01'
WHERE id = 'e1000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT vpa_registration_status_normalised FROM public.pharmacy_premises
   WHERE id = 'e1000000-0000-4000-8000-000000000001'),
  'active',
  'a past registration date does not close a premises'
);

UPDATE public.pharmacy_premises
SET vpa_currently_observed = false
WHERE id = 'e1000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT vpa_registration_status_normalised FROM public.pharmacy_premises
   WHERE id = 'e1000000-0000-4000-8000-000000000001'),
  'active',
  'absence from one snapshot does not close a premises'
);
SELECT is(
  (SELECT vpa_registration_status_normalised FROM public.pharmacy_premises
   WHERE id = 'e1000000-0000-4000-8000-000000000002'),
  'unknown',
  'unknown source status does not close a never-closed premises'
);
SELECT is(
  (SELECT vpa_registration_status_normalised FROM public.pharmacy_premises
   WHERE id = 'e1000000-0000-4000-8000-000000000003'),
  'review_required',
  'review-required source status does not close a never-closed premises'
);

UPDATE public.pharmacy_premises
SET vpa_registration_status_normalised = 'unknown'
WHERE id = 'e1000000-0000-4000-8000-000000000004';
SELECT is(
  (SELECT vpa_pbs_match_state FROM public.pharmacy_premises
   WHERE id = 'e1000000-0000-4000-8000-000000000004'),
  'closed_historical',
  'closed-to-unknown remains historical'
);
SELECT ok(
  NOT (SELECT included_in_default_active_map
       FROM public.pharmacy_premises_vpa_lifecycle
       WHERE id = 'e1000000-0000-4000-8000-000000000004'),
  'closed-to-unknown does not return to the default map'
);
UPDATE public.pharmacy_premises
SET vpa_registration_status_normalised = 'review_required'
WHERE id = 'e1000000-0000-4000-8000-000000000004';
SELECT ok(
  NOT (SELECT included_in_default_active_map
       FROM public.pharmacy_premises_vpa_lifecycle
       WHERE id = 'e1000000-0000-4000-8000-000000000004'),
  'closed-to-review-required does not reopen'
);
UPDATE public.pharmacy_premises
SET vpa_registration_status_normalised = 'active',
    vpa_last_observed_at = now() + interval '1 minute'
WHERE id = 'e1000000-0000-4000-8000-000000000004';
SELECT ok(
  (SELECT included_in_default_active_map
   FROM public.pharmacy_premises_vpa_lifecycle
   WHERE id = 'e1000000-0000-4000-8000-000000000004'),
  'only explicit active status reopens a closed premises'
);

INSERT INTO public.pharmacy_premises_licensees (
  id, premises_id, vpa_record_key, vpa_premises_name, licensee_name,
  last_seen_at, currently_observed, license_status
) VALUES (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'inactive-licensee-fixture', 'Active Fixture', 'Inactive Licensee',
  now(), false, 'Inactive'
);
SELECT is(
  (SELECT vpa_registration_status_normalised FROM public.pharmacy_premises
   WHERE id = 'e1000000-0000-4000-8000-000000000001'),
  'active',
  'inactive and no-longer-observed licensee does not close a premises'
);

SELECT is(
  (SELECT count(*)::integer FROM public.pharmacy_vpa_runs
   WHERE status IN ('validated', 'promoting', 'promoted')),
  0,
  'no incomplete source run is treated as a successful closure source'
);

SELECT * FROM finish();
ROLLBACK;
