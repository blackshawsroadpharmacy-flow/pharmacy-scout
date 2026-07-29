# WP20 genuine dispensing calibration workspace

WP20 records genuine organisation-private actual dispensing observations without fitting or
validating a predictive model.

## Evidence contract

Every observation retains the pharmacy, average scripts per trading day, evidence-period dates,
trading days per week, explicit included/excluded/unknown status for private, under co-payment,
dose-administration-aid and institutional supply, narrative inclusion/exclusion definitions, source,
source type, source note, confidence, entrant and timestamps.

Unknown inclusion status remains `NULL`. It is never converted to false or zero.

## Entry and review

- Authenticated organisation members can enter one observation manually.
- The downloadable CSV template contains headers only and no fabricated example rows.
- CSV rows are schema-validated. Invalid or database-rejected rows are quarantined in the import
  audit record rather than coerced.
- New evidence starts `unreviewed`, then may move through `in_review`, `verified` or `rejected`.
- The workspace warns about overlapping evidence periods and differing inclusion definitions for
  the same pharmacy.
- RLS denies anonymous and cross-organisation access to observations and import history.

## Calibration readiness

- Fewer than 10 distinct genuine pharmacies: relative model only; predictive fitting is disabled.
- 10–29: experimental cohort with low confidence; fitting is not automatic.
- 30 or more: validation may be considered, but moderate confidence still requires documented
  geographic diversity and holdout or cross-validation error.

The workspace does not fit a model, claim predictive accuracy, describe the model as trained, seed
observations or infer operational quality.
