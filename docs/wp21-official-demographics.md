# WP21 — official ABS demographic enrichment

WP21 imports a reproducible, lawful subset of official Australian Bureau of Statistics data. It
does not turn absent or suppressed values into zero and does not claim that an SA2 average is a
pharmacy catchment or street-level estimate.

## Sources and licence

Both sources are published by the Australian Bureau of Statistics under Creative Commons
Attribution 4.0 International. Attribution: **Australian Bureau of Statistics**.

- `2021 Census General Community Profile, Statistical Area Level 2, Victoria, short header`
  - Endpoint:
    `https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SA2_for_VIC_short-header.zip`
  - Reference year: 2021 Census
  - Geography: SA2, ASGS Edition 3 (2021)
  - Imported fields: total persons; ages 0–4, 65–74, 75–84 and 85+; persons reporting a core
    activity need for assistance; occupied private dwellings with no motor vehicle; total and
    not-stated vehicle responses.
- `Socio-Economic Indexes for Areas (SEIFA), Australia, 2021 — Statistical Area Level 2`
  - Endpoint:
    `https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia/2021/Statistical%20Area%20Level%202%2C%20Indexes%2C%20SEIFA%202021.xlsx`
  - Reference year: 2021 Census
  - Geography: SA2, ASGS Edition 3 (2021)
  - Imported fields: Index of Relative Socio-economic Disadvantage score, Victorian decile and
    percentile; Index of Economic Resources score and Victorian decile.

The generated migration records the retrieval timestamp, exact endpoints, source SHA-256 hashes,
field definitions, geography edition, attribution, suppression rules and coverage limitations.
Run `node scripts/import-abs-demographics.mjs` to fetch the official files and reproduce it.

## Semantics and missing values

- Blank, `np`, `..`, `na` and non-numeric source cells become SQL `NULL`, never zero.
- A percentage is calculated only when both its numerator and denominator are present and the
  denominator is greater than zero.
- Age 65+ is the sum of 65–74, 75–84 and 85+ source counts. Age 75+ is the sum of 75–84 and 85+.
- No-vehicle percentage uses occupied dwellings with a stated vehicle count as its denominator;
  not-stated responses are excluded and preserved in provenance.
- SEIFA IRSD is an area-level relative index. It is not an individual or household characteristic.
- Census usual-resident counts and Estimated Resident Population are different measures. WP21
  preserves them separately; the existing 2024 ERP/growth layer remains independently labelled.

## Spatial assignment and coverage

Pharmacies and candidate points are assigned server-side with PostGIS point-in-polygon against
official 2021 SA2 boundaries. The assignment method is recorded as `point-in-polygon`, with 100%
area coverage only for the matched point—not a claim of population-weighted catchment coverage.
Viewport geometries are simplified and clipped by a server-side bounding-box query (maximum 600
areas), so statewide spatial calculations do not run in the browser.

The source profile covers the 522 Victorian SA2 codes represented by the official boundary seed.
Optional fields can remain null without blocking the profile. Coverage status and missing reasons
are exposed in dossiers, candidate evidence, scenarios, map tooltips, model evidence and Radar
explanations.

## Model use

WP21 adds official demographics to the GDP model's raw evidence and confidence calculation. It
does not fit a predictive model, change theoretical scripts/day into actual volume, or claim
accuracy. Calibration remains based only on genuine organisation-private observations.

## Import dependency note

The source workbook parser is a development-only dependency and processes the fixed official ABS
endpoint. It is not included in the browser bundle and does not accept user uploads.
