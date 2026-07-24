
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.opportunity_type AS ENUM ('acquisition', 'greenfield', 'relocation');
CREATE TYPE public.pipeline_stage AS ENUM (
  'watchlist', 'contacting', 'im_received', 'due_diligence', 'offer', 'passed', 'acquired'
);
CREATE TYPE public.verification_status AS ENUM (
  'unverified', 'matched', 'verified', 'conflict'
);
CREATE TYPE public.door_source AS ENUM (
  'geocoded', 'osm', 'user_verified', 'imported'
);
CREATE TYPE public.premises_source_type AS ENUM (
  'healthdirect', 'osm', 'vpa_register', 'pbs_register', 'manual'
);

-- ============================================================
-- Timestamp trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Organisations & membership
-- ============================================================
CREATE TABLE public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT ALL ON public.organisations TO service_role;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_organisations_updated
  BEFORE UPDATE ON public.organisations FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organisation_members (
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_members TO authenticated;
GRANT ALL ON public.organisation_members TO service_role;
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  current_organisation_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Profile auto-creation on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- User roles (separate table + security definer)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = _org AND user_id = auth.uid()
  );
$$;

-- Policies: organisations
CREATE POLICY "orgs viewable by members" ON public.organisations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id) OR created_by = auth.uid());
CREATE POLICY "orgs insert by any authenticated" ON public.organisations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "orgs update by members" ON public.organisations
  FOR UPDATE TO authenticated
  USING (public.is_org_member(id));

-- Policies: organisation_members
CREATE POLICY "members viewable by self or org peers" ON public.organisation_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(organisation_id));
CREATE POLICY "members insert by org creator or self-add via org creator" ON public.organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = organisation_id AND o.created_by = auth.uid())
  );
CREATE POLICY "members delete self" ON public.organisation_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Policies: profiles
CREATE POLICY "profiles read self" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles update self" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles insert self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Policies: user_roles
CREATE POLICY "roles read self" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Source records
-- ============================================================
CREATE TABLE public.source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_kind public.premises_source_type NOT NULL,
  source_url TEXT,
  regulatory_purpose TEXT,
  licence_or_terms_status TEXT,
  fetched_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  coverage_geometry GEOGRAPHY(POLYGON, 4326),
  coverage_description TEXT,
  row_count INTEGER,
  checksum TEXT,
  confidence TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.source_records TO authenticated;
GRANT ALL ON public.source_records TO service_role;
ALTER TABLE public.source_records ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_source_records_updated
  BEFORE UPDATE ON public.source_records FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "source_records readable by authenticated" ON public.source_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "source_records admin write" ON public.source_records
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Pharmacy premises (shared discovery)
-- ============================================================
CREATE TABLE public.pharmacy_premises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  suburb TEXT,
  postcode TEXT,
  locality_name TEXT,
  location GEOGRAPHY(POINT, 4326),
  public_door_location GEOGRAPHY(POINT, 4326),
  door_source public.door_source,
  door_confidence TEXT,
  door_verified_at TIMESTAMPTZ,
  door_verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vpa_registration_status public.verification_status NOT NULL DEFAULT 'unverified',
  vpa_registration_checked_at TIMESTAMPTZ,
  vpa_source_id UUID REFERENCES public.source_records(id) ON DELETE SET NULL,
  premises_source public.premises_source_type NOT NULL,
  source_confidence TEXT,
  source_id UUID REFERENCES public.source_records(id) ON DELETE SET NULL,
  phone TEXT,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.pharmacy_premises TO authenticated;
GRANT ALL ON public.pharmacy_premises TO service_role;
ALTER TABLE public.pharmacy_premises ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pharmacy_premises_updated
  BEFORE UPDATE ON public.pharmacy_premises FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "premises readable by authenticated" ON public.pharmacy_premises
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "premises admin insert" ON public.pharmacy_premises
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Update policy: admins can update anything; non-admins can only update door fields (enforced by RPC)
CREATE POLICY "premises admin update" ON public.pharmacy_premises
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Door-point correction RPC (available to any authenticated user)
CREATE OR REPLACE FUNCTION public.set_premises_door(
  _premises_id UUID, _lat DOUBLE PRECISION, _lng DOUBLE PRECISION
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.pharmacy_premises
     SET public_door_location = ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography,
         door_source = 'user_verified',
         door_confidence = 'user_verified',
         door_verified_at = now(),
         door_verified_by = auth.uid(),
         updated_at = now()
   WHERE id = _premises_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_premises_door(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

CREATE INDEX ix_pharmacy_premises_location ON public.pharmacy_premises USING GIST (location);
CREATE INDEX ix_pharmacy_premises_door ON public.pharmacy_premises USING GIST (public_door_location);

-- ============================================================
-- PBS approvals (kept separate)
-- ============================================================
CREATE TABLE public.pbs_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  premises_id UUID REFERENCES public.pharmacy_premises(id) ON DELETE SET NULL,
  approval_number TEXT NOT NULL,
  approval_status public.verification_status NOT NULL DEFAULT 'unverified',
  original_rule_item TEXT,
  original_approval_date DATE,
  original_town TEXT,
  approval_source_id UUID REFERENCES public.source_records(id) ON DELETE SET NULL,
  source_confidence TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (approval_number)
);
GRANT SELECT ON public.pbs_approvals TO authenticated;
GRANT ALL ON public.pbs_approvals TO service_role;
ALTER TABLE public.pbs_approvals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pbs_approvals_updated
  BEFORE UPDATE ON public.pbs_approvals FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "pbs_approvals readable by authenticated" ON public.pbs_approvals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pbs_approvals admin write" ON public.pbs_approvals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Pharmacy businesses (private per org)
-- ============================================================
CREATE TABLE public.pharmacy_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  trading_name TEXT NOT NULL,
  premises_id UUID REFERENCES public.pharmacy_premises(id) ON DELETE SET NULL,
  opportunity_status TEXT,
  asking_price NUMERIC(14,2),
  broker_or_source TEXT,
  listing_url TEXT,
  private_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_businesses TO authenticated;
GRANT ALL ON public.pharmacy_businesses TO service_role;
ALTER TABLE public.pharmacy_businesses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pharmacy_businesses_updated
  BEFORE UPDATE ON public.pharmacy_businesses FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "businesses select by org" ON public.pharmacy_businesses
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "businesses insert by org" ON public.pharmacy_businesses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organisation_id) AND created_by = auth.uid());
CREATE POLICY "businesses update by org" ON public.pharmacy_businesses
  FOR UPDATE TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "businesses delete by org" ON public.pharmacy_businesses
  FOR DELETE TO authenticated USING (public.is_org_member(organisation_id));

-- ============================================================
-- Candidate sites (private per org)
-- ============================================================
CREATE TABLE public.candidate_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address TEXT,
  location GEOGRAPHY(POINT, 4326),
  public_door_location GEOGRAPHY(POINT, 4326),
  site_type TEXT,
  listing_url TEXT,
  rent NUMERIC(14,2),
  area_sqm NUMERIC(10,2),
  planning_use_status TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_sites TO authenticated;
GRANT ALL ON public.candidate_sites TO service_role;
ALTER TABLE public.candidate_sites ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_candidate_sites_updated
  BEFORE UPDATE ON public.candidate_sites FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "sites org select" ON public.candidate_sites
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "sites org insert" ON public.candidate_sites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organisation_id) AND created_by = auth.uid());
CREATE POLICY "sites org update" ON public.candidate_sites
  FOR UPDATE TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "sites org delete" ON public.candidate_sites
  FOR DELETE TO authenticated USING (public.is_org_member(organisation_id));

-- ============================================================
-- Opportunities (private per org)
-- ============================================================
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  type public.opportunity_type NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  business_id UUID REFERENCES public.pharmacy_businesses(id) ON DELETE SET NULL,
  candidate_site_id UUID REFERENCES public.candidate_sites(id) ON DELETE SET NULL,
  origin_approval_id UUID REFERENCES public.pbs_approvals(id) ON DELETE SET NULL,
  pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'watchlist',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_opportunities_updated
  BEFORE UPDATE ON public.opportunities FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "opps org select" ON public.opportunities
  FOR SELECT TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "opps org insert" ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organisation_id) AND created_by = auth.uid());
CREATE POLICY "opps org update" ON public.opportunities
  FOR UPDATE TO authenticated USING (public.is_org_member(organisation_id));
CREATE POLICY "opps org delete" ON public.opportunities
  FOR DELETE TO authenticated USING (public.is_org_member(organisation_id));

-- ============================================================
-- Seed source_records for Phase 1 discovery sources
-- ============================================================
INSERT INTO public.source_records
  (id, source_name, source_kind, source_url, regulatory_purpose, licence_or_terms_status,
   fetched_at, coverage_description, row_count, confidence, notes)
VALUES
  (gen_random_uuid(),
   'HealthDirect Service Directory',
   'healthdirect',
   'https://www.healthdirect.gov.au/australian-health-services',
   'Discovery of likely pharmacy locations. Not a legal register.',
   'Requires API key registered to an organisation; discovery use only.',
   now(),
   'Camberwell, Hawthorn, Kew, Balwyn, Glen Iris and surrounding suburbs',
   NULL,
   'medium',
   'Discovery records only. Never treat as PBS approval or VPA registration evidence.'),
  (gen_random_uuid(),
   'Victorian Pharmacy Authority public register',
   'vpa_register',
   'https://www.pharmacy.vic.gov.au/registers/pharmacy-businesses-register/',
   'Authoritative Victorian licence and premises-registration status.',
   'No public bulk feed. Import by admin CSV upload only.',
   NULL,
   'Statewide Victoria (when imported)',
   NULL,
   'unverified',
   'Placeholder. No records loaded until an admin imports a CSV snapshot.'),
  (gen_random_uuid(),
   'PBS approved pharmacies register',
   'pbs_register',
   'https://www.pbs.gov.au/browse/pharmacies',
   'Authoritative Commonwealth section 90 PBS approvals.',
   'Import by admin CSV upload only. Never inferred from other sources.',
   NULL,
   'National (when imported)',
   NULL,
   'unverified',
   'Placeholder. No approvals loaded until an admin imports a CSV snapshot.'),
  (gen_random_uuid(),
   'OpenStreetMap base map tiles',
   'osm',
   'https://www.openstreetmap.org/copyright',
   'Base map only. Not a source of legal designations.',
   'Open Database Licence. Attribution required.',
   now(),
   'Global',
   NULL,
   'reference',
   'Tiles only. OSM tagging is not legal evidence of designated-complex status.');
