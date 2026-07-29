# WP22 — healthcare-demand anchors

WP22 adds authoritative residential aged-care evidence without turning facilities or approved
places into guaranteed prescription demand.

## Official aged-care source

- Dataset: **Aged care service list: 30 June 2025 — Victoria**
- Publisher: Australian Government Department of Health, Disability and Ageing
- Endpoint:
  `https://www.gen-agedcaredata.gov.au/getmedia/d0c1b04b-89ee-4636-aeaa-dd49dd85f2f1/VIC-Service-List-2025`
- Licence: Creative Commons Attribution 4.0 International
- Reference date: 30 June 2025
- Retrieval date: 29 July 2026
- Imported: 745 residential and multi-purpose services with source-published coordinates

The reproducible importer retains facility name, provider, physical address, care type, published
residential places, organisation type, source row, coordinates and source SHA-256. The annual
publication does not expose a stable service identifier or operational status; both remain null
rather than being fabricated. Published residential places are not described as occupied beds.

Raw source records remain separate from canonical anchors. The canonical layer never lets a
lower-quality discovery field erase an official identity, type, coordinate or published-place
value.

Run `node scripts/import-official-aged-care.mjs` to fetch the fixed official source and reproduce
the additive migration.

## Other healthcare categories

The schema explicitly supports public, private, day, specialist and unknown hospitals, emergency
department status, community health, urgent care and medical centres. This package does not import
a purported statewide hospital list because no sufficiently authoritative, reusable and
machine-readable source was confirmed during the package. Hospital distance and count therefore
remain unavailable, not zero. Existing OpenStreetMap medical-centre records remain a separately
labelled discovery layer; they are not promoted to official canonical identity.

## Spatial and model behaviour

PostGIS calculates facility counts and published-place sums at 500 m, 1 km, 2 km and 5 km. The
viewport RPC is bounded to 750 records. Candidate and saved-scenario evidence uses the same
server-side function. GDP raw evidence receives a separate healthcare context and weighted anchor
index, but no bed/place-to-prescription conversion is made and the model does not claim accuracy.

Map, dossier, candidate and statewide search surfaces disclose source date, confidence and coverage
limitations. Missing fields remain null.
