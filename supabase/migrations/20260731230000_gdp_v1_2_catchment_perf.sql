-- GDP v1.2 catchment performance: index-prefiltered area apportionment.
--
-- PROBLEM: refresh_dispensing_potential_v1_2() times out (>2 min, the Supabase
-- pooler statement_timeout cap which even SET LOCAL cannot raise) on the
-- post-promotion 1,382-premise set, because public.catchment_population()
-- recomputes ST_MakeValid() across ALL 522 ABS SA2 polygons for EVERY pharmacy
-- row (1,382 x 522 ~= 721k ST_MakeValid calls) and the valid_areas CTE is
-- materialised without a spatial predicate, so the GIST index on
-- dispensing_population_areas.boundary is never used.
--
-- FIX: push ST_Intersects into the scan so the existing GIST index selects only
-- the ~2-5 SA2 areas that actually intersect each 2 km buffer; ST_MakeValid then
-- runs only on those candidates. The apportionment formula is unchanged.
--
-- CORRECTNESS NOTE (read-only validation against production, 2026-07-31):
-- For 5 sampled premises the optimised result is bit-identical to the deployed
-- function. Summed across all 1,382 premises the optimised total is 37,722,851
-- vs the deployed 37,722,616 -- a 235-unit (0.0006%) difference, because the
-- deployed function filters with ST_Intersects(ST_MakeValid(boundary), buffer)
-- while this version filters with ST_Intersects(original boundary, buffer) for
-- index use; for a handful of slightly-self-intersecting SA2 polygons those two
-- predicates disagree at the edge. ST_Intersects on the original boundary is
-- already relied on everywhere else in this schema.
--
-- If bit-identity is required, prefer the alternative: a stored generated
-- column  boundary_valid geometry(MULTIPOLYGON,4326) GENERATED ALWAYS AS
-- (ST_MakeValid(boundary)) STORED  plus a GIST index on it, and filter on
-- boundary_valid. That preserves the deployed predicate exactly while still
-- using an index. Not implemented here to avoid an un-rehearsed ALTER TABLE.
--
-- NOT applied to production. Needs a local dress rehearsal
-- (supabase db reset --local + supabase db test) and a decision on the
-- bit-identity trade-off before merge.

CREATE OR REPLACE FUNCTION public.catchment_population(
  _location GEOGRAPHY, _radius_m INTEGER DEFAULT 2000
) RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH catchment AS (
    SELECT ST_Buffer(_location, _radius_m)::geometry AS geom
  )
  SELECT COALESCE(SUM(
    a.population_2024
      * (ST_Area(ST_Intersection(ST_MakeValid(a.boundary), c.geom)::geography)
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
  'Population within a radius, apportioned by the share of each intersecting SA2 the catchment covers. Index-prefiltered so ST_MakeValid runs only on intersecting areas. Not a residency count.';
