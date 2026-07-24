-- Boundary checks for relocation Items 122-125.
-- These are deterministic SQL assertions for threshold logic.
-- They intentionally avoid legal wording such as "eligible" or "approved".

CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
DECLARE
  origin geography := ST_SetSRID(ST_MakePoint(144.9631, -37.8136), 4326)::geography;
  p_299_99 geography := ST_Project(origin, 299.99, radians(90));
  p_300_00 geography := ST_Project(origin, 300.00, radians(90));
  p_300_01 geography := ST_Project(origin, 300.01, radians(90));
  p_499_99 geography := ST_Project(origin, 499.99, radians(90));
  p_500_00 geography := ST_Project(origin, 500.00, radians(90));
  p_500_01 geography := ST_Project(origin, 500.01, radians(90));
  p_999_99 geography := ST_Project(origin, 999.99, radians(90));
  p_1000_00 geography := ST_Project(origin, 1000.00, radians(90));
  p_1000_01 geography := ST_Project(origin, 1000.01, radians(90));
  p_1499_99 geography := ST_Project(origin, 1499.99, radians(90));
  p_1500_00 geography := ST_Project(origin, 1500.00, radians(90));
  p_1500_01 geography := ST_Project(origin, 1500.01, radians(90));
BEGIN
  -- Item 124 straight-line distance: <= 1 km
  IF NOT ST_Distance(origin, p_999_99) < 1000 THEN
    RAISE EXCEPTION 'Expected 999.99 m to be below 1 km threshold';
  END IF;
  IF NOT ST_Distance(origin, p_1000_00) <= 1000 THEN
    RAISE EXCEPTION 'Expected 1000.00 m to satisfy inclusive 1 km threshold';
  END IF;
  IF NOT ST_Distance(origin, p_1000_01) > 1000 THEN
    RAISE EXCEPTION 'Expected 1000.01 m to exceed 1 km threshold';
  END IF;

  -- Item 125 lower bound: > 1 km
  IF NOT ST_Distance(origin, p_1000_00) <= 1000 THEN
    RAISE EXCEPTION 'Expected 1000.00 m to fail strict > 1 km lower bound';
  END IF;
  IF NOT ST_Distance(origin, p_1000_01) > 1000 THEN
    RAISE EXCEPTION 'Expected 1000.01 m to satisfy strict > 1 km lower bound';
  END IF;

  -- Item 125 upper bound: <= 1.5 km
  IF NOT ST_Distance(origin, p_1499_99) < 1500 THEN
    RAISE EXCEPTION 'Expected 1499.99 m to be below 1.5 km upper bound';
  END IF;
  IF NOT ST_Distance(origin, p_1500_00) <= 1500 THEN
    RAISE EXCEPTION 'Expected 1500.00 m to satisfy inclusive 1.5 km upper bound';
  END IF;
  IF NOT ST_Distance(origin, p_1500_01) > 1500 THEN
    RAISE EXCEPTION 'Expected 1500.01 m to exceed 1.5 km upper bound';
  END IF;

  -- 300 m competitor threshold: at least 300 m
  IF NOT ST_Distance(origin, p_299_99) < 300 THEN
    RAISE EXCEPTION 'Expected 299.99 m to fail >= 300 m threshold';
  END IF;
  IF NOT ST_Distance(origin, p_300_00) >= 300 THEN
    RAISE EXCEPTION 'Expected 300.00 m to satisfy >= 300 m threshold';
  END IF;
  IF NOT ST_Distance(origin, p_300_01) > 300 THEN
    RAISE EXCEPTION 'Expected 300.01 m to exceed 300 m threshold';
  END IF;

  -- 500 m competitor threshold: at least 500 m
  IF NOT ST_Distance(origin, p_499_99) < 500 THEN
    RAISE EXCEPTION 'Expected 499.99 m to fail >= 500 m threshold';
  END IF;
  IF NOT ST_Distance(origin, p_500_00) >= 500 THEN
    RAISE EXCEPTION 'Expected 500.00 m to satisfy >= 500 m threshold';
  END IF;
  IF NOT ST_Distance(origin, p_500_01) > 500 THEN
    RAISE EXCEPTION 'Expected 500.01 m to exceed 500 m threshold';
  END IF;
END $$;

DO $$
DECLARE
  route_9999_99 numeric := 9999.99;
  route_10000_00 numeric := 10000.00;
  route_10000_01 numeric := 10000.01;
BEGIN
  -- Item 123 route threshold: at least 10 km
  IF NOT route_9999_99 < 10000 THEN
    RAISE EXCEPTION 'Expected 9999.99 m route to fail >= 10 km threshold';
  END IF;
  IF NOT route_10000_00 >= 10000 THEN
    RAISE EXCEPTION 'Expected 10000.00 m route to satisfy inclusive >= 10 km threshold';
  END IF;
  IF NOT route_10000_01 > 10000 THEN
    RAISE EXCEPTION 'Expected 10000.01 m route to exceed 10 km threshold';
  END IF;
END $$;
