CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace AND typname = 'external_verification_status'
  ) THEN
    CREATE TYPE public.external_verification_status AS ENUM (
      'confirmed', 'probable', 'unverified', 'conflicting', 'stale', 'no_source_coverage'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.external_source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dataset_url TEXT NOT NULL,
  licence_name TEXT,
  licence_url TEXT,
  terms_status TEXT NOT NULL CHECK (terms_status IN ('approved', 'review_required', 'restricted')),
  attribution_text TEXT,
  geographic_coverage TEXT,
  priority SMALLINT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_source_registry(id),
  category TEXT NOT NULL CHECK (category IN (
    'supermarkets', 'medical_centres', 'hospitals', 'shopping_centres',
    'parking_facilities', 'traffic_sites'
  )),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'dry_run')),
  dataset_version TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  duplicate_candidate_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  exact_geocode_count INTEGER NOT NULL DEFAULT 0,
  approximate_geocode_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_raw_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_source_registry(id),
  import_run_id UUID NOT NULL REFERENCES public.external_import_runs(id),
  category TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_url TEXT,
  dataset_version TEXT,
  fetched_at TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL,
  record_hash TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN (
    'accepted', 'rejected', 'duplicate_candidate', 'conflicting', 'out_of_state'
  )),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, category, source_record_id, record_hash)
);

CREATE TABLE IF NOT EXISTS public.external_entity_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  incumbent_source_id UUID REFERENCES public.external_source_registry(id),
  incoming_source_id UUID REFERENCES public.external_source_registry(id),
  incumbent_value JSONB,
  incoming_value JSONB,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved', 'dismissed')),
  import_run_id UUID REFERENCES public.external_import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.external_source_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_source_registry(id),
  category TEXT NOT NULL,
  coverage_name TEXT NOT NULL,
  coverage_geometry GEOMETRY(MULTIPOLYGON, 4326),
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('covered', 'partial', 'no_source_coverage')),
  observed_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  UNIQUE (source_id, category, coverage_name)
);

CREATE TABLE IF NOT EXISTS public.supermarkets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_source_registry(id),
  source_record_id TEXT NOT NULL,
  source_url TEXT,
  source_dataset_version TEXT,
  raw_record_id UUID REFERENCES public.external_raw_records(id),
  import_run_id UUID NOT NULL REFERENCES public.external_import_runs(id),
  name TEXT NOT NULL,
  trading_name TEXT,
  brand TEXT,
  normalised_name TEXT NOT NULL,
  address TEXT,
  normalised_address TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  boundary GEOMETRY(GEOMETRY, 4326),
  public_entrance GEOGRAPHY(POINT, 4326),
  opening_hours TEXT,
  floor_area_sqm NUMERIC CHECK (floor_area_sqm IS NULL OR floor_area_sqm >= 0),
  floor_area_source TEXT,
  coordinate_method TEXT NOT NULL,
  coordinate_confidence NUMERIC NOT NULL CHECK (coordinate_confidence BETWEEN 0 AND 1),
  verification_status public.external_verification_status NOT NULL DEFAULT 'unverified',
  licence_status TEXT NOT NULL,
  geographic_coverage TEXT,
  observed_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);

CREATE TABLE IF NOT EXISTS public.medical_centres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_source_registry(id),
  source_record_id TEXT NOT NULL,
  source_url TEXT,
  source_dataset_version TEXT,
  raw_record_id UUID REFERENCES public.external_raw_records(id),
  import_run_id UUID NOT NULL REFERENCES public.external_import_runs(id),
  name TEXT NOT NULL,
  trading_name TEXT,
  normalised_name TEXT NOT NULL,
  address TEXT,
  normalised_address TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  boundary GEOMETRY(GEOMETRY, 4326),
  services JSONB,
  opening_hours TEXT,
  known_practitioners JSONB,
  practitioner_evidence_source TEXT,
  coordinate_method TEXT NOT NULL,
  coordinate_confidence NUMERIC NOT NULL CHECK (coordinate_confidence BETWEEN 0 AND 1),
  verification_status public.external_verification_status NOT NULL DEFAULT 'unverified',
  licence_status TEXT NOT NULL,
  geographic_coverage TEXT,
  observed_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS ix_external_raw_source_record
  ON public.external_raw_records (source_id, category, source_record_id);
CREATE INDEX IF NOT EXISTS ix_external_conflicts_entity
  ON public.external_entity_conflicts (category, entity_id, status);
CREATE INDEX IF NOT EXISTS ix_supermarkets_location ON public.supermarkets USING GIST (location);
CREATE INDEX IF NOT EXISTS ix_supermarkets_name ON public.supermarkets (normalised_name);
CREATE INDEX IF NOT EXISTS ix_supermarkets_source_record ON public.supermarkets (source_id, source_record_id);
CREATE INDEX IF NOT EXISTS ix_medical_centres_location ON public.medical_centres USING GIST (location);
CREATE INDEX IF NOT EXISTS ix_medical_centres_name ON public.medical_centres (normalised_name);
CREATE INDEX IF NOT EXISTS ix_medical_centres_source_record ON public.medical_centres (source_id, source_record_id);

INSERT INTO public.external_source_registry (
  source_key, name, dataset_url, licence_name, licence_url, terms_status,
  attribution_text, geographic_coverage, priority
) VALUES (
  'osm-overpass-victoria',
  'OpenStreetMap contributors via Overpass API',
  'https://overpass-api.de/api/interpreter',
  'Open Data Commons Open Database License 1.0',
  'https://www.openstreetmap.org/copyright',
  'approved',
  '© OpenStreetMap contributors',
  'Victoria, Australia; community-contributed coverage varies',
  200
) ON CONFLICT (source_key) DO UPDATE SET
  name = EXCLUDED.name,
  dataset_url = EXCLUDED.dataset_url,
  licence_name = EXCLUDED.licence_name,
  licence_url = EXCLUDED.licence_url,
  terms_status = EXCLUDED.terms_status,
  attribution_text = EXCLUDED.attribution_text,
  geographic_coverage = EXCLUDED.geographic_coverage,
  priority = EXCLUDED.priority,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.external_points_in_viewport(
  p_category TEXT,
  p_west DOUBLE PRECISION,
  p_south DOUBLE PRECISION,
  p_east DOUBLE PRECISION,
  p_north DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 2000
) RETURNS TABLE (
  id UUID, category TEXT, name TEXT, address TEXT, lat DOUBLE PRECISION,
  lng DOUBLE PRECISION, verification_status TEXT, coordinate_confidence NUMERIC,
  source_name TEXT, source_url TEXT, fetched_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_west < 140 OR p_east > 150 OR p_south < -40 OR p_north > -33
     OR p_west >= p_east OR p_south >= p_north THEN
    RAISE EXCEPTION 'Invalid Victorian viewport';
  END IF;
  IF p_limit < 1 OR p_limit > 5000 THEN RAISE EXCEPTION 'Invalid limit'; END IF;

  IF p_category = 'supermarkets' THEN
    RETURN QUERY
    SELECT s.id, 'supermarkets'::TEXT, s.name, s.address,
      ST_Y(s.location::geometry), ST_X(s.location::geometry),
      s.verification_status::TEXT, s.coordinate_confidence, r.name, s.source_url, s.fetched_at
    FROM public.supermarkets s JOIN public.external_source_registry r ON r.id = s.source_id
    WHERE s.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
    ORDER BY s.name LIMIT p_limit;
  ELSIF p_category = 'medical_centres' THEN
    RETURN QUERY
    SELECT m.id, 'medical_centres'::TEXT, m.name, m.address,
      ST_Y(m.location::geometry), ST_X(m.location::geometry),
      m.verification_status::TEXT, m.coordinate_confidence, r.name, m.source_url, m.fetched_at
    FROM public.medical_centres m JOIN public.external_source_registry r ON r.id = m.source_id
    WHERE m.location && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)::geography
    ORDER BY m.name LIMIT p_limit;
  ELSE
    RAISE EXCEPTION 'Unsupported category';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.external_entity_dossier(p_category TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF p_category = 'supermarkets' THEN
    SELECT to_jsonb(x) INTO result FROM (
      SELECT s.id, 'supermarkets' AS category, s.name, s.trading_name, s.brand, s.address,
        ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
        s.opening_hours, s.floor_area_sqm, s.floor_area_source, s.coordinate_method,
        s.coordinate_confidence, s.verification_status, s.source_url, s.observed_at,
        s.fetched_at, s.updated_at, r.name AS source_name, r.licence_name,
        r.attribution_text, r.geographic_coverage,
        COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.external_entity_conflicts c
          WHERE c.category = 'supermarkets' AND c.entity_id = s.id AND c.status = 'unresolved'), '[]'::jsonb)
          AS conflicts
      FROM public.supermarkets s JOIN public.external_source_registry r ON r.id = s.source_id
      WHERE s.id = p_id
    ) x;
  ELSIF p_category = 'medical_centres' THEN
    SELECT to_jsonb(x) INTO result FROM (
      SELECT m.id, 'medical_centres' AS category, m.name, m.trading_name, m.address,
        ST_Y(m.location::geometry) AS lat, ST_X(m.location::geometry) AS lng,
        m.services, m.opening_hours, m.known_practitioners, m.practitioner_evidence_source,
        m.coordinate_method, m.coordinate_confidence, m.verification_status, m.source_url,
        m.observed_at, m.fetched_at, m.updated_at, r.name AS source_name, r.licence_name,
        r.attribution_text, r.geographic_coverage,
        COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.external_entity_conflicts c
          WHERE c.category = 'medical_centres' AND c.entity_id = m.id AND c.status = 'unresolved'), '[]'::jsonb)
          AS conflicts
      FROM public.medical_centres m JOIN public.external_source_registry r ON r.id = m.source_id
      WHERE m.id = p_id
    ) x;
  ELSE
    RAISE EXCEPTION 'Unsupported category';
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.candidate_external_summary(
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH point AS (SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS g)
  SELECT jsonb_build_object(
    'supermarkets_within_500m', (SELECT count(*) FROM public.supermarkets s, point p
      WHERE ST_DWithin(s.location, p.g, 500)),
    'medical_centres_within_500m', (SELECT count(*) FROM public.medical_centres m, point p
      WHERE ST_DWithin(m.location, p.g, 500)),
    'assessment', 'insufficient evidence',
    'professional_measurement_required', true,
    'source_coverage', 'OpenStreetMap discovery coverage; completeness not guaranteed',
    'unresolved_evidence', jsonb_build_array(
      'Supermarket floor area is not inferred',
      'Medical practitioner or PBS prescriber counts are not inferred',
      'Discovery proximity is not a legal determination'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.import_external_location_batch(
  p_source_key TEXT,
  p_category TEXT,
  p_fetched_at TIMESTAMPTZ,
  p_records JSONB,
  p_rejected JSONB DEFAULT '[]'::jsonb,
  p_duplicate_candidates JSONB DEFAULT '[]'::jsonb,
  p_metrics JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  source_row public.external_source_registry%ROWTYPE;
  run_id UUID;
  record JSONB;
  raw_id UUID;
  imported INTEGER := 0;
  rejected INTEGER := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
  IF p_category NOT IN ('supermarkets', 'medical_centres') THEN
    RAISE EXCEPTION 'Unsupported category';
  END IF;
  SELECT * INTO source_row FROM public.external_source_registry WHERE source_key = p_source_key;
  IF source_row.id IS NULL OR source_row.terms_status <> 'approved' THEN
    RAISE EXCEPTION 'Source missing or not approved';
  END IF;

  INSERT INTO public.external_import_runs (
    source_id, category, status, started_at, fetched_count, imported_count, rejected_count,
    duplicate_candidate_count, conflict_count, stale_count, exact_geocode_count,
    approximate_geocode_count, metrics
  ) VALUES (
    source_row.id, p_category, 'running', now(),
    COALESCE((p_metrics->>'fetched_count')::INTEGER, jsonb_array_length(p_records)),
    0, 0,
    COALESCE((p_metrics->>'duplicate_candidate_count')::INTEGER, 0),
    COALESCE((p_metrics->>'conflict_count')::INTEGER, 0),
    COALESCE((p_metrics->>'stale_count')::INTEGER, 0),
    COALESCE((p_metrics->>'exact_geocode_count')::INTEGER, 0),
    COALESCE((p_metrics->>'approximate_geocode_count')::INTEGER, 0),
    p_metrics
  ) RETURNING id INTO run_id;

  FOR record IN SELECT value FROM jsonb_array_elements(p_records)
  LOOP
    IF record->>'source_record_id' IS NULL
       OR (record->>'lat')::DOUBLE PRECISION NOT BETWEEN -39.3 AND -33.8
       OR (record->>'lng')::DOUBLE PRECISION NOT BETWEEN 140.8 AND 150.1 THEN
      RAISE EXCEPTION 'Invalid accepted record';
    END IF;
    INSERT INTO public.external_raw_records (
      source_id, import_run_id, category, source_record_id, source_url, fetched_at,
      observed_at, raw_payload, record_hash, disposition
    ) VALUES (
      source_row.id, run_id, p_category, record->>'source_record_id', record->>'source_url',
      p_fetched_at, NULLIF(record->>'observed_at', '')::TIMESTAMPTZ, record->'raw_payload',
      record->>'record_hash', 'accepted'
    ) ON CONFLICT (source_id, category, source_record_id, record_hash)
      DO UPDATE SET import_run_id = EXCLUDED.import_run_id, fetched_at = EXCLUDED.fetched_at
    RETURNING id INTO raw_id;

    IF p_category = 'supermarkets' THEN
      INSERT INTO public.supermarkets (
        source_id, source_record_id, source_url, raw_record_id, import_run_id, name,
        trading_name, brand, normalised_name, address, normalised_address, location,
        opening_hours, floor_area_sqm, floor_area_source, coordinate_method,
        coordinate_confidence, verification_status, licence_status, geographic_coverage,
        observed_at, fetched_at
      ) VALUES (
        source_row.id, record->>'source_record_id', record->>'source_url', raw_id, run_id,
        record->>'name', record->>'trading_name', record->>'brand', record->>'normalised_name',
        record->>'address', record->>'normalised_address',
        ST_SetSRID(ST_MakePoint((record->>'lng')::DOUBLE PRECISION, (record->>'lat')::DOUBLE PRECISION), 4326)::geography,
        record->>'opening_hours', NULLIF(record->>'floor_area_sqm', '')::NUMERIC,
        record->>'floor_area_source', record->>'coordinate_method',
        (record->>'coordinate_confidence')::NUMERIC,
        (record->>'verification_status')::public.external_verification_status,
        record->>'licence_status', record->>'geographic_coverage',
        NULLIF(record->>'observed_at', '')::TIMESTAMPTZ, p_fetched_at
      ) ON CONFLICT (source_id, source_record_id) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        raw_record_id = EXCLUDED.raw_record_id,
        import_run_id = EXCLUDED.import_run_id,
        name = EXCLUDED.name,
        trading_name = COALESCE(EXCLUDED.trading_name, public.supermarkets.trading_name),
        brand = COALESCE(EXCLUDED.brand, public.supermarkets.brand),
        normalised_name = EXCLUDED.normalised_name,
        address = COALESCE(EXCLUDED.address, public.supermarkets.address),
        normalised_address = COALESCE(EXCLUDED.normalised_address, public.supermarkets.normalised_address),
        location = EXCLUDED.location,
        opening_hours = COALESCE(EXCLUDED.opening_hours, public.supermarkets.opening_hours),
        coordinate_method = EXCLUDED.coordinate_method,
        coordinate_confidence = EXCLUDED.coordinate_confidence,
        geographic_coverage = EXCLUDED.geographic_coverage,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = now();
    ELSE
      INSERT INTO public.medical_centres (
        source_id, source_record_id, source_url, raw_record_id, import_run_id, name,
        trading_name, normalised_name, address, normalised_address, location, services,
        opening_hours, known_practitioners, practitioner_evidence_source, coordinate_method,
        coordinate_confidence, verification_status, licence_status, geographic_coverage,
        observed_at, fetched_at
      ) VALUES (
        source_row.id, record->>'source_record_id', record->>'source_url', raw_id, run_id,
        record->>'name', record->>'trading_name', record->>'normalised_name',
        record->>'address', record->>'normalised_address',
        ST_SetSRID(ST_MakePoint((record->>'lng')::DOUBLE PRECISION, (record->>'lat')::DOUBLE PRECISION), 4326)::geography,
        record->'services', record->>'opening_hours', record->'known_practitioners',
        record->>'practitioner_evidence_source', record->>'coordinate_method',
        (record->>'coordinate_confidence')::NUMERIC,
        (record->>'verification_status')::public.external_verification_status,
        record->>'licence_status', record->>'geographic_coverage',
        NULLIF(record->>'observed_at', '')::TIMESTAMPTZ, p_fetched_at
      ) ON CONFLICT (source_id, source_record_id) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        raw_record_id = EXCLUDED.raw_record_id,
        import_run_id = EXCLUDED.import_run_id,
        name = EXCLUDED.name,
        trading_name = COALESCE(EXCLUDED.trading_name, public.medical_centres.trading_name),
        normalised_name = EXCLUDED.normalised_name,
        address = COALESCE(EXCLUDED.address, public.medical_centres.address),
        normalised_address = COALESCE(EXCLUDED.normalised_address, public.medical_centres.normalised_address),
        location = EXCLUDED.location,
        services = COALESCE(EXCLUDED.services, public.medical_centres.services),
        opening_hours = COALESCE(EXCLUDED.opening_hours, public.medical_centres.opening_hours),
        coordinate_method = EXCLUDED.coordinate_method,
        coordinate_confidence = EXCLUDED.coordinate_confidence,
        geographic_coverage = EXCLUDED.geographic_coverage,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = now();
    END IF;
    imported := imported + 1;
  END LOOP;

  FOR record IN SELECT value FROM jsonb_array_elements(p_rejected)
  LOOP
    INSERT INTO public.external_raw_records (
      source_id, import_run_id, category, source_record_id, source_url, fetched_at,
      raw_payload, record_hash, disposition, rejection_reason
    ) VALUES (
      source_row.id, run_id, p_category,
      COALESCE(record->>'source_record_id', 'rejected:' || record->>'record_hash'),
      record->>'source_url', p_fetched_at, record->'raw_payload', record->>'record_hash',
      CASE WHEN (record->'rejection_reasons') ? 'out_of_state'
        THEN 'out_of_state' ELSE 'rejected' END,
      record->'rejection_reasons'::TEXT
    ) ON CONFLICT DO NOTHING;
    rejected := rejected + 1;
  END LOOP;

  UPDATE public.external_import_runs SET
    status = 'completed', finished_at = now(), imported_count = imported,
    rejected_count = rejected
  WHERE id = run_id;

  RETURN jsonb_build_object('import_run_id', run_id, 'imported_count', imported,
    'rejected_count', rejected, 'duplicate_candidate_count', jsonb_array_length(p_duplicate_candidates));
EXCEPTION WHEN OTHERS THEN
  IF run_id IS NOT NULL THEN
    UPDATE public.external_import_runs SET status = 'failed', finished_at = now(),
      error_summary = SQLERRM WHERE id = run_id;
  END IF;
  RAISE;
END $$;

REVOKE ALL ON public.external_source_registry, public.external_import_runs,
  public.external_raw_records, public.external_entity_conflicts, public.external_source_coverage,
  public.supermarkets, public.medical_centres FROM anon, authenticated;
GRANT ALL ON public.external_source_registry, public.external_import_runs,
  public.external_raw_records, public.external_entity_conflicts, public.external_source_coverage,
  public.supermarkets, public.medical_centres TO service_role;

ALTER TABLE public.external_source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_raw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_entity_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_source_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supermarkets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_centres ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.external_points_in_viewport(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.external_entity_dossier(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_external_summary(DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.import_external_location_batch(TEXT, TEXT, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_external_location_batch(TEXT, TEXT, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB) TO service_role;
