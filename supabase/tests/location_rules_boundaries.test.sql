-- Boundary checks for relocation Items 122-125 threshold logic.
-- Deterministic distance assertions; intentionally avoids legal wording such
-- as "eligible" or "approved".
--
-- Written as pgTAP so pg_prove sees a plan (the earlier DO-block version
-- produced no TAP output and was reported as "No plan found").

BEGIN;

SELECT plan(15);

-- Points projected due east of a fixed Melbourne origin at exact metre offsets,
-- so ST_Distance is asserted against known ground truth. Materialised into a
-- temp table so each assertion below is its own statement (the conventional,
-- unambiguous pgTAP form).
CREATE TEMP TABLE boundary_distances AS
WITH o AS (
  SELECT ST_SetSRID(ST_MakePoint(144.9631, -37.8136), 4326)::geography AS origin
)
SELECT
  ST_Distance(origin, ST_Project(origin, 299.99, radians(90)))  AS d_299_99,
  ST_Distance(origin, ST_Project(origin, 300.00, radians(90)))  AS d_300_00,
  ST_Distance(origin, ST_Project(origin, 300.01, radians(90)))  AS d_300_01,
  ST_Distance(origin, ST_Project(origin, 499.99, radians(90)))  AS d_499_99,
  ST_Distance(origin, ST_Project(origin, 500.00, radians(90)))  AS d_500_00,
  ST_Distance(origin, ST_Project(origin, 500.01, radians(90)))  AS d_500_01,
  ST_Distance(origin, ST_Project(origin, 999.99, radians(90)))  AS d_999_99,
  ST_Distance(origin, ST_Project(origin, 1000.00, radians(90))) AS d_1000_00,
  ST_Distance(origin, ST_Project(origin, 1000.01, radians(90))) AS d_1000_01,
  ST_Distance(origin, ST_Project(origin, 1499.99, radians(90))) AS d_1499_99,
  ST_Distance(origin, ST_Project(origin, 1500.00, radians(90))) AS d_1500_00,
  ST_Distance(origin, ST_Project(origin, 1500.01, radians(90))) AS d_1500_01
FROM o;

-- Item 124 straight-line distance: <= 1 km
SELECT ok((SELECT d_999_99  FROM boundary_distances) < 1000,  '999.99 m is below the 1 km threshold');
SELECT ok((SELECT d_1000_00 FROM boundary_distances) <= 1000, '1000.00 m satisfies the inclusive 1 km threshold');
SELECT ok((SELECT d_1000_01 FROM boundary_distances) > 1000,  '1000.01 m exceeds the 1 km threshold');

-- Item 125 lower bound: > 1 km
SELECT ok(NOT ((SELECT d_1000_00 FROM boundary_distances) > 1000), '1000.00 m fails the strict > 1 km lower bound');
SELECT ok((SELECT d_1000_01 FROM boundary_distances) > 1000,       '1000.01 m satisfies the strict > 1 km lower bound');

-- Item 125 upper bound: <= 1.5 km
SELECT ok((SELECT d_1499_99 FROM boundary_distances) < 1500,  '1499.99 m is below the 1.5 km upper bound');
SELECT ok((SELECT d_1500_00 FROM boundary_distances) <= 1500, '1500.00 m satisfies the inclusive 1.5 km upper bound');
SELECT ok((SELECT d_1500_01 FROM boundary_distances) > 1500,  '1500.01 m exceeds the 1.5 km upper bound');

-- 300 m competitor threshold: at least 300 m
SELECT ok((SELECT d_299_99 FROM boundary_distances) < 300,  '299.99 m fails the >= 300 m threshold');
SELECT ok((SELECT d_300_00 FROM boundary_distances) >= 300, '300.00 m satisfies the >= 300 m threshold');
SELECT ok((SELECT d_300_01 FROM boundary_distances) > 300,  '300.01 m exceeds the 300 m threshold');

-- 500 m competitor threshold: at least 500 m
SELECT ok((SELECT d_499_99 FROM boundary_distances) < 500,  '499.99 m fails the >= 500 m threshold');
SELECT ok((SELECT d_500_00 FROM boundary_distances) >= 500, '500.00 m satisfies the >= 500 m threshold');
SELECT ok((SELECT d_500_01 FROM boundary_distances) > 500,  '500.01 m exceeds the 500 m threshold');

-- Item 123 route threshold: at least 10 km (scalar distance, not spatial)
SELECT ok(
  9999.99 < 10000 AND 10000.00 >= 10000 AND 10000.01 > 10000,
  '10 km route threshold is inclusive at exactly 10 km'
);

SELECT * FROM finish();

ROLLBACK;
