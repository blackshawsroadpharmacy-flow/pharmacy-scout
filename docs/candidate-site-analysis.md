# Candidate-site and relocation preliminary analysis

## Separation of concepts

The candidate workflow keeps these evidence classes separate:

1. **Discovery evidence** — pharmacy discovery rows and OpenStreetMap supermarket/medical-centre
   records.
2. **Sourced evidence** — source name, record link, retrieval date, verification state, conflicts and
   coordinate method.
3. **Calculated distance** — PostGIS geography distance between the candidate point and a sourced
   display coordinate.
4. **Preliminary interpretation** — one controlled assessment label, never a legal conclusion.
5. **Professional verification required** — public-door and statutory measurement remain outside
   this commercial workflow.

The UI and RPC use only:

- `appears to satisfy`
- `does not appear to satisfy`
- `insufficient evidence`
- `professional measurement required`
- `source coverage incomplete`

The current slice deliberately does not produce `appears to satisfy` or `does not appear to
satisfy`, because no versioned rule pathway has been selected and production has no authoritative
PBS/VPA coverage. Proximity alone cannot establish eligibility.

## Server queries

- `candidate_nearest_pharmacy` — optional confirmed-only nearest lookup using PostGIS KNN ordering.
  “Confirmed” requires a verified VPA registration or verified PBS approval.
- `candidate_pharmacies_within_radius` — configurable 100–20,000 metre discovery radius.
- `candidate_external_within_500m` — separately queries supermarkets or medical centres.
- `candidate_site_analysis` — assembles the above safe evidence into the printable panel.

Approximate suburb-centroid and conflicting pharmacy coordinates retain their calculated
point-to-point distance for discovery, but `distance_usable` is false and the assessment requires
professional measurement. No invented uncertainty buffer is subtracted or added.

## Explicit non-inferences

The system does not infer:

- supermarket floor area;
- general-practitioner FTE;
- PBS prescriber counts;
- public-door coordinates;
- regulatory compliance or legal eligibility from proximity;
- missing source coverage as a zero count.

## Population context

The candidate coordinate is intersected with the ABS SA2_RP_2024 service. Population density and
2023–24 annual growth are contextual area evidence. They do not alter a legal assessment label.
Unknown values display “No source coverage”.

## Address search

Address search uses OpenStreetMap Nominatim, bounded to Victorian operating coordinates. The chosen
result retains its OSM record URL. Map click remains available without address search. Saved
candidate sites remain protected by existing organisation RLS and are not exposed anonymously.

## Security

Anonymous users may execute the four read-only, bounded evidence functions. They cannot read raw
external import records, source conflicts, private candidate sites or organisation opportunities.
The functions return only fields required for the preliminary assessment.
