
-- Public read access for the map (anonymous browsing)
GRANT SELECT ON public.pharmacy_premises TO anon;
GRANT SELECT ON public.pbs_approvals TO anon;
GRANT SELECT ON public.source_records TO anon;
GRANT SELECT ON public.pharmacy_premises_geo TO anon;

DROP POLICY IF EXISTS "Public can read pharmacy premises" ON public.pharmacy_premises;
CREATE POLICY "Public can read pharmacy premises"
  ON public.pharmacy_premises FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read pbs approvals" ON public.pbs_approvals;
CREATE POLICY "Public can read pbs approvals"
  ON public.pbs_approvals FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read source records" ON public.source_records;
CREATE POLICY "Public can read source records"
  ON public.source_records FOR SELECT TO anon, authenticated USING (true);

-- Seed Victoria-wide discovery points. All marked as low-confidence
-- discovery records; nothing here is claimed VPA-registered or PBS-approved.
DO $$
DECLARE
  src_id uuid;
BEGIN
  SELECT id INTO src_id FROM public.source_records
    WHERE source_name = 'HealthDirect Service Directory' LIMIT 1;

  INSERT INTO public.pharmacy_premises
    (name, address, suburb, postcode, locality_name, location,
     premises_source, source_confidence, source_id,
     vpa_registration_status)
  VALUES
    -- Melbourne CBD
    ('Pharmacy discovery point', '210 Bourke St', 'Melbourne', '3000', 'Melbourne CBD',
      ST_SetSRID(ST_MakePoint(144.9670, -37.8130), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', '271 Collins St', 'Melbourne', '3000', 'Melbourne CBD',
      ST_SetSRID(ST_MakePoint(144.9640, -37.8163), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', '600 Elizabeth St', 'Melbourne', '3000', 'Melbourne CBD',
      ST_SetSRID(ST_MakePoint(144.9585, -37.8080), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', '211 La Trobe St', 'Melbourne', '3000', 'Melbourne CBD',
      ST_SetSRID(ST_MakePoint(144.9630, -37.8105), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- Inner north / east
    ('Pharmacy discovery point', 'Smith St', 'Fitzroy', '3065', 'Fitzroy',
      ST_SetSRID(ST_MakePoint(144.9790, -37.7980), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Sydney Rd', 'Brunswick', '3056', 'Brunswick',
      ST_SetSRID(ST_MakePoint(144.9600, -37.7680), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'High St', 'Northcote', '3070', 'Northcote',
      ST_SetSRID(ST_MakePoint(145.0000, -37.7700), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Bridge Rd', 'Richmond', '3121', 'Richmond',
      ST_SetSRID(ST_MakePoint(145.0080, -37.8180), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Chapel St', 'South Yarra', '3141', 'South Yarra',
      ST_SetSRID(ST_MakePoint(144.9930, -37.8380), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Acland St', 'St Kilda', '3182', 'St Kilda',
      ST_SetSRID(ST_MakePoint(144.9820, -37.8680), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- Inner west
    ('Pharmacy discovery point', 'Barkly St', 'Footscray', '3011', 'Footscray',
      ST_SetSRID(ST_MakePoint(144.9010, -37.8000), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Douglas Pde', 'Williamstown', '3016', 'Williamstown',
      ST_SetSRID(ST_MakePoint(144.8990, -37.8620), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- South east metro
    ('Pharmacy discovery point', 'Centre Rd', 'Bentleigh', '3204', 'Bentleigh',
      ST_SetSRID(ST_MakePoint(145.0350, -37.9170), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Nepean Hwy', 'Cheltenham', '3192', 'Cheltenham',
      ST_SetSRID(ST_MakePoint(145.0530, -37.9670), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Main St', 'Mornington', '3931', 'Mornington',
      ST_SetSRID(ST_MakePoint(145.0400, -38.2170), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Nepean Hwy', 'Frankston', '3199', 'Frankston',
      ST_SetSRID(ST_MakePoint(145.1230, -38.1440), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Lonsdale St', 'Dandenong', '3175', 'Dandenong',
      ST_SetSRID(ST_MakePoint(145.2140, -37.9870), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Springvale Rd', 'Springvale', '3171', 'Springvale',
      ST_SetSRID(ST_MakePoint(145.1500, -37.9500), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- Outer east
    ('Pharmacy discovery point', 'Whitehorse Rd', 'Box Hill', '3128', 'Box Hill',
      ST_SetSRID(ST_MakePoint(145.1220, -37.8190), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Maroondah Hwy', 'Ringwood', '3134', 'Ringwood',
      ST_SetSRID(ST_MakePoint(145.2280, -37.8140), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Main St', 'Croydon', '3136', 'Croydon',
      ST_SetSRID(ST_MakePoint(145.2810, -37.7960), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Burwood Hwy', 'Ferntree Gully', '3156', 'Ferntree Gully',
      ST_SetSRID(ST_MakePoint(145.2870, -37.8830), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- Outer north
    ('Pharmacy discovery point', 'High St', 'Preston', '3072', 'Preston',
      ST_SetSRID(ST_MakePoint(144.9970, -37.7420), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Bell St', 'Coburg', '3058', 'Coburg',
      ST_SetSRID(ST_MakePoint(144.9670, -37.7420), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Sydney Rd', 'Campbellfield', '3061', 'Campbellfield',
      ST_SetSRID(ST_MakePoint(144.9500, -37.6800), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'High St', 'Epping', '3076', 'Epping',
      ST_SetSRID(ST_MakePoint(145.0330, -37.6480), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- Outer west
    ('Pharmacy discovery point', 'Watton St', 'Werribee', '3030', 'Werribee',
      ST_SetSRID(ST_MakePoint(144.6620, -37.9020), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Old Geelong Rd', 'Hoppers Crossing', '3029', 'Hoppers Crossing',
      ST_SetSRID(ST_MakePoint(144.7000, -37.8830), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Point Cook Rd', 'Point Cook', '3030', 'Point Cook',
      ST_SetSRID(ST_MakePoint(144.7500, -37.9160), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Melton Hwy', 'Melton', '3337', 'Melton',
      ST_SetSRID(ST_MakePoint(144.5850, -37.6830), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    -- Regional centres
    ('Pharmacy discovery point', 'Ryrie St', 'Geelong', '3220', 'Geelong CBD',
      ST_SetSRID(ST_MakePoint(144.3617, -38.1499), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Pakington St', 'Geelong West', '3218', 'Geelong West',
      ST_SetSRID(ST_MakePoint(144.3480, -38.1450), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Great Ocean Rd', 'Torquay', '3228', 'Torquay',
      ST_SetSRID(ST_MakePoint(144.3260, -38.3320), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Sturt St', 'Ballarat', '3350', 'Ballarat Central',
      ST_SetSRID(ST_MakePoint(143.8503, -37.5623), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Pall Mall', 'Bendigo', '3550', 'Bendigo CBD',
      ST_SetSRID(ST_MakePoint(144.2809, -36.7570), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'High St', 'Kyneton', '3444', 'Kyneton',
      ST_SetSRID(ST_MakePoint(144.4570, -37.2440), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Wyndham St', 'Shepparton', '3630', 'Shepparton',
      ST_SetSRID(ST_MakePoint(145.4000, -36.3820), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Liebig St', 'Warrnambool', '3280', 'Warrnambool',
      ST_SetSRID(ST_MakePoint(142.4830, -38.3810), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Langtree Ave', 'Mildura', '3500', 'Mildura',
      ST_SetSRID(ST_MakePoint(142.1600, -34.1870), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Franklin St', 'Traralgon', '3844', 'Traralgon',
      ST_SetSRID(ST_MakePoint(146.5390, -38.1960), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'High St', 'Wodonga', '3690', 'Wodonga',
      ST_SetSRID(ST_MakePoint(146.8880, -36.1240), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Nicholson St', 'Bairnsdale', '3875', 'Bairnsdale',
      ST_SetSRID(ST_MakePoint(147.6180, -37.8280), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Vincent St', 'Ararat', '3377', 'Ararat',
      ST_SetSRID(ST_MakePoint(142.9280, -37.2830), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Main St', 'Sale', '3850', 'Sale',
      ST_SetSRID(ST_MakePoint(147.0640, -38.1120), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Commercial Rd', 'Morwell', '3840', 'Morwell',
      ST_SetSRID(ST_MakePoint(146.3960, -38.2340), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'High St', 'Echuca', '3564', 'Echuca',
      ST_SetSRID(ST_MakePoint(144.7580, -36.1330), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Camp St', 'Beechworth', '3747', 'Beechworth',
      ST_SetSRID(ST_MakePoint(146.6870, -36.3600), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Fitzroy St', 'Sea Lake', '3533', 'Sea Lake',
      ST_SetSRID(ST_MakePoint(142.8500, -35.5030), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Main St', 'Portland', '3305', 'Portland',
      ST_SetSRID(ST_MakePoint(141.6050, -38.3460), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified'),
    ('Pharmacy discovery point', 'Murray Valley Hwy', 'Swan Hill', '3585', 'Swan Hill',
      ST_SetSRID(ST_MakePoint(143.5540, -35.3380), 4326)::geography,
      'healthdirect', 'low', src_id, 'unverified');
END $$;

CREATE INDEX IF NOT EXISTS pharmacy_premises_location_gix
  ON public.pharmacy_premises USING GIST (location);
