# VPA public-access audit

## Decision for PR #39

The public map currently relies on anonymous access to the legacy
`pharmacy_premises` table through security-invoker views and bounded RPCs. That
pre-existing table grant exposes more columns than the public map needs. The VPA
lifecycle view previously amplified the problem with `SELECT p.*`; migration
`20260730151000` replaces that view with an explicit public-safe projection.

PR #39 does not revoke the legacy base-table grant because doing so safely
requires replacing every anonymous dossier, viewport, freshness, source, and PBS
read path with a public-safe view or bounded RPC and then testing the complete
anonymous map. Combining that access-architecture migration with alert,
lifecycle, geocode, and licensee-integrity hardening would materially expand the
review surface.

## Public map requirements

The anonymous map requires only:

- canonical premises ID;
- display name and public address/locality/postcode;
- validated latitude/longitude and public door location where approved;
- public source/provenance and geocode-quality labels;
- public VPA registration state and carefully selected official register fields;
- public PBS approval summary;
- public phone and website when intentionally published.

It does not require internal notes, review queues, run/staging identifiers,
matching candidates/conflicts, audit metadata, private organisation data, alert
data, or calibration/commercial evidence.

Published VPA registered-licensee names are public-source data, but this project
currently exposes the dedicated licensee tables only to authenticated users.
That remains the conservative decision until product/privacy review explicitly
approves anonymous presentation.

## Blocking pre-production follow-up

Before any VPA migration is applied to production:

1. inventory every anonymous query against `pharmacy_premises`;
2. create an explicit public-safe premises view and bounded dossier RPC;
3. migrate map, search, dossier, PBS, and freshness clients to those contracts;
4. revoke anonymous direct table access;
5. add column-level negative tests for internal VPA matching, review, run, and
   audit fields;
6. rerun anonymous desktop/mobile map, search, and dossier tests.

This is a blocking security task for production migration approval, not a reason
to weaken the focused safeguards in PR #39.
