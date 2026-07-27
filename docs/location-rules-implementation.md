# Pharmacy Location Rules Implementation

This document records the current implementation shape for relocation Items `122` to `125` in the Victorian Pharmacy Scout codebase.

The application must never describe a result as legally `eligible` or `approved`. Result labels must stay within:

- `appears_to_satisfy`
- `does_not_appear_to_satisfy`
- `insufficient_evidence`
- `professional_measurement_required`
- `not_applicable`
- `source_coverage_incomplete`

## Sources

- Legislative instrument: section 90 and Division 4B of the _National Health Act 1953_ and the determinations made under section 99L.
- Applicant guidance: _Pharmacy Location Rules Applicant's Handbook_, March 2026 V1.10.

Handbook citations used below:

- Relocation-wide requirements and 5-year exceptions: handbook pp. 19-20 (`Applications involving the relocation of an existing pharmacy`)
- Item 122: handbook pp. 22-23
- Item 123: handbook pp. 24-25
- Item 124: handbook pp. 26-28
- Item 125: handbook pp. 29-31
- Same-town glossary: handbook glossary entry `same town`, p. 57

## Cross-Cutting Relocation Gates

These gates apply before any Item 122-125 pathway can return `appears_to_satisfy`.

### Cancellation gate

- An approved pharmacist must request cancellation of the existing approval immediately before the proposed approval is granted.
- Evidence-driven only. The map app cannot infer this from geospatial data.
- If absent, result is `insufficient_evidence`.

Citation:

- Handbook pp. 19-20

### Five-year continuous approval gate

- One or more approvals for the existing premises must have been in force continuously for at least 5 years immediately before the application date.
- If the 5-year period is not met, the workflow must evaluate exceptions explicitly rather than silently assuming they apply.

Citation:

- Handbook pp. 19-20

### Five-year exceptions

The handbook describes these exception pathways for approvals in force less than 5 years:

1. Same designated complex relocation under Item 122.
2. Only approved premises in the town relocating within the same town under Item 123.
3. Temporary relocation during renovation or refurbishment, except where the application is under Item 125.
4. Return to the same or substantially same renovated / refurbished premises, except where the application is under Item 125.
5. Disaster or exceptional circumstances preventing future supply at the existing premises, except where the application is under Item 125.
6. Existing approval previously granted after an expansion or contraction, where the combined existing and previous approvals total at least 5 continuous years.
7. Expansion / contraction application referred to the Authority.

Implementation rule:

- Each exception must be represented as its own evidence checklist.
- If none is positively supported, the result remains `does_not_appear_to_satisfy`.
- If the evidence is missing or mixed, the result is `insufficient_evidence`.

Citation:

- Handbook pp. 19-20

## Item 122 Atomic Requirements

Rule title:

- `Relocation within a designated complex`

Atomic requirements:

1. The proposed premises are in the same designated complex as the existing premises.
2. The complex classification is evidenced as one of:
   - small shopping centre
   - large shopping centre
   - large medical centre
   - large private hospital
3. Where relevant, single-management evidence is present for the shopping centre or large medical centre.

Implementation notes:

- This is not a geometry-only test.
- Shared parcel / building geometry is not enough to infer designated-complex status.
- A missing complex boundary, type, or single-management proof must produce `insufficient_evidence`.

Suggested evidence fields:

- `complex_type`
- `complex_name`
- `boundary_source`
- `single_management_status`
- `single_management_evidence`
- `floor_plan_url`
- `statutory_declaration_reference`

Citation:

- Handbook pp. 22-23

## Item 123 Atomic Requirements

Rule title:

- `Relocation within the same town (10 km)`

Atomic requirements:

1. The proposed premises are in the same town as the existing premises.
2. The proposed premises are at least `10 km` by the shortest lawful access route from the nearest approved premises other than the existing premises.

Implementation notes:

- `same town` requires the same locality name and the same postcode, not merely geographic closeness.
- The shortest lawful access route can be walking, driving, or another lawful public route, or a combination of modes.
- The route measurement must run from the midpoint at ground level of the nearest public-access door at each premises.
- Near-threshold cases must escalate to `professional_measurement_required`.

Data dependencies:

- confirmed or conservative competitor set
- door-point geometry for origin, destination, and competitor
- routing provider output

Citation:

- Handbook pp. 24-25
- Handbook glossary `same town`, p. 57

## Item 124 Atomic Requirements

Rule title:

- `Relocation up to 1 km`

Atomic requirements:

1. The proposed premises are no more than `1 km` in a straight line from the existing premises.
2. One of the following pathway conditions is satisfied:
   - the existing premises are **not** in a designated complex
   - the existing premises are in a **large shopping centre** and the proposed premises are at least `300 m` in a straight line from **all** approved premises not in that large shopping centre
   - the existing premises are in a **small shopping centre**, **large medical centre**, or **large private hospital** and the proposed premises are at least `500 m` in a straight line from **all** approved premises not in that same complex

Implementation notes:

- Distances are straight-line geography distances between public-access door points.
- The `all approved premises` wording matters. This path cannot short-circuit on the single nearest competitor.
- If competitor coverage is incomplete, the top-level result must be `source_coverage_incomplete`.

Citation:

- Handbook pp. 26-28

## Item 125 Atomic Requirements

Rule title:

- `Relocation of 1 to 1.5 km`

Atomic requirements:

1. The proposed premises are more than `1 km` and no more than `1.5 km` in a straight line from the existing premises.
2. One of the following pathway conditions is satisfied:
   - the existing premises are **not** in a designated complex and the proposed premises are at least `300 m` in a straight line from the nearest approved premises
   - the existing premises are in a **large shopping centre** and the proposed premises are at least `300 m` in a straight line from the nearest approved premises
   - the existing premises are in a **small shopping centre**, **large medical centre**, or **large private hospital** and the proposed premises are at least `500 m` in a straight line from the nearest approved premises

Implementation notes:

- This item uses the nearest approved premises comparator, unlike Item 124's `all approved premises` wording.
- Distances remain straight-line geography distances between public-access door points.
- Near-threshold cases must escalate to `professional_measurement_required`.

Citation:

- Handbook pp. 29-31

## Original-Approval Relocation Restrictions

These restrictions must sit above any otherwise-favourable Item 124 or 125 spatial result.

### Original approval under Item 131 or 132

- The proposed premises must remain within the same town in which the approval was originally granted.
- The app must never return `appears_to_satisfy` if original-town evidence is missing.

Citation:

- Handbook pp. 28-31
- Handbook Item 131 restriction p. 36+
- Handbook Item 132 restriction p. 38+

### Original approval under Item 133, 134 or 134A

- If relocation is sought within 10 years of the original approval, exceptional circumstances are required when the proposed premises are not within the same facility in which the approval was originally granted.

Citation:

- Handbook pp. 28-31
- Handbook Items 133 / 134 / 134A restriction sections

### Original approval under Item 135

- Exceptional circumstances are required if the proposed premises are not within the same private hospital in which the approval was originally granted.

Citation:

- Handbook Item 135 restriction section

### Original approval under Item 136

- Exceptional circumstances are required if the proposed premises are not within the same medical centre in which the approval was originally granted.

Citation:

- Handbook Item 136 restriction section

## Incomplete Confirmed-PBS Coverage

Competitor-dependent calculations must apply a coverage gate.

Implementation rule:

1. Run the competitor calculation against the confirmed-PBS set.
2. Run a second sensitivity check against the broader conservative community-pharmacy set when PBS coverage is incomplete.
3. If confirmed-PBS coverage is incomplete for the relevant region, the top-level result becomes `source_coverage_incomplete`, even where the confirmed-only calculation would otherwise pass.

Why:

- The handbook assumes a complete set of approved premises.
- The current product does not yet hold a complete confirmed PBS dataset for Victoria.

## Boundary Handling

Threshold comparisons to encode:

- `at least 300 m` means `>= 300`
- `at least 500 m` means `>= 500`
- `no more than 1 km` means `<= 1000`
- `more than 1 km` means `> 1000`
- `no more than 1.5 km` means `<= 1500`
- `at least 10 km` means `>= 10000`

Near-threshold safeguard:

- If a measurement is within a configurable warning margin of a legal threshold and the result depends on door geometry or routing precision, return `professional_measurement_required`.
