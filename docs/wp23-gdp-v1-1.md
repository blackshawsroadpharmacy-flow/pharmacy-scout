# Geographic Dispensing Potential v1.1

`gdp-v1.1.0` is a versioned, assumption-based commercial screening model. It sits alongside immutable `gdp-v1.0.0` results and is not a trained or validated prediction of actual dispensing.

## Changes

- Adds official ABS 2021 SA2 age 65+, age 75+, core-activity assistance, SEIFA and vehicle-access evidence where available.
- Adds official Australian Government residential aged-care services and published approved places.
- Reweights the five existing components and records every assumption, rationale, implementation date and actor.
- Separates potential from evidence confidence. Confidence can widen the theoretical range and add warnings, but cannot increase the score.
- Provides a per-pharmacy v1.0 versus v1.1 comparison and Radar rankings for ageing demand, aged-care anchors, healthcare demand, strong high-confidence potential, low demographic resolution and largest model change.

## Guardrails

SA2 statistics are area context, not street-level catchments. Approved places are not occupied beds or guaranteed prescription demand. Statewide hospital coverage remains unavailable and is not represented as zero.

The experimental scripts/day equivalent is not actual dispensing volume. With fewer than 10 genuine verified pharmacies, fitting remains disabled and calibration readiness is reported separately. No accuracy claim is permitted without a diverse sample and documented holdout or cross-validation error.
