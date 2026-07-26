# External location intelligence

## Continuation baseline

- Production Git branch: `main`
- GitHub default branch: `main`
- Latest merged production commit: `a74e4d88f27233a3a59da7584ae8f1ffca7fbeb3`
- Newer Lovable continuation tip inspected: `63acdb06cc2f31cd781a2d526d09e908589eb86f`
- Continuation branch: `openclaw/external-location-intelligence`
- Continuation baseline: `63acdb06cc2f31cd781a2d526d09e908589eb86f`
- Production URL: <https://chemistacquisitions.lovable.app>

The continuation branch starts from the newer unmerged Lovable history because it descends from
the merged production commit. The existing `main` checkout had unrelated uncommitted package and
icon changes, so this work uses a separate clean worktree. No production history is rebased or
force-pushed.

The Supabase project reference in `supabase/config.toml`, the newer Lovable build configuration and
the production endpoint configuration were compared without recording keys in this document. They
identify the same intended project. Public publishable credentials are build-time configuration;
service-role credentials remain server-only and untracked.

## Source catalogue

| Category        | Source                                      | Dataset/query                                                                                                           | Licence  | Attribution                                          | Status                 |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------- | ---------------------- |
| Supermarkets    | OpenStreetMap contributors via Overpass API | Victorian `shop=supermarket` nodes, ways and relations                                                                  | ODbL 1.0 | © OpenStreetMap contributors; link to copyright page | Approved for discovery |
| Medical centres | OpenStreetMap contributors via Overpass API | Victorian `amenity=clinic`, `amenity=doctors`, `healthcare=clinic`, `healthcare=centre` and `healthcare=doctor` records | ODbL 1.0 | © OpenStreetMap contributors; link to copyright page | Approved for discovery |

Dataset links:

- <https://www.openstreetmap.org/copyright>
- <https://wiki.openstreetmap.org/wiki/Overpass_API>
- <https://wiki.openstreetmap.org/wiki/Tag:shop%3Dsupermarket>
- <https://wiki.openstreetmap.org/wiki/Key:healthcare>

OpenStreetMap is used as lawful statewide discovery data, not as proof of floor area, practitioner
capacity, PBS prescriber count, legal eligibility or regulatory compliance. OSM geometry may be
useful for discovery and public entrances, but it does not outrank an official source for
authoritative attributes.

## Field-aware precedence

1. Official government or facility records outrank community discovery records for authoritative
   facility attributes.
2. A source may update only fields it actually supplies. Unknown values never erase a sourced value.
3. A newer lower-priority observation does not replace a higher-priority value merely because it is
   newer.
4. Distinct credible values are retained as field-level conflicts and surfaced for review.
5. OpenStreetMap remains useful for geometry, entrances, paths, opening hours and discovery even
   when an official record supplies the canonical name or address.

## Import operation

```bash
npm run import:external -- --category supermarkets --dry-run
npm run import:external -- --category medical_centres --dry-run
npm run import:external -- --category supermarkets --push
npm run import:external -- --category medical_centres --push
```

The adapter queries Overpass reproducibly, preserves every raw record, generates deterministic
source keys (`osm:{element_type}:{element_id}`), validates Victorian coordinates, normalises names
and addresses, quarantines invalid records, and upserts through a service-role-only database
function. Rerunning an unchanged input is idempotent.

## Geocoding

OSM coordinates or geometry centres are treated as source-provided coordinates. No external
geocoder is used for the initial slices. The coordinate method is `source_point` for nodes and
`source_geometry_centroid` for way/relation centres. Neither is described as a street-entrance
measurement unless a separate entrance point is genuinely sourced.

## Coverage and limitations

- Coverage is statewide Victoria but reflects the completeness and freshness of OSM contributions.
- Absence from OSM means “not discovered by this source”, not proof that a facility does not exist.
- Floor area, practitioner counts and legal threshold evidence remain unknown unless separately
  sourced.
- Polygon centres are approximate facility display points and are not professional measurements.
- Import timestamps describe retrieval time; `observed_at` remains null when the upstream record
  does not publish an observation date.

## Deployment and rollback

Apply migrations with the linked Supabase CLI, run dry imports, review metrics, then run push
imports. Deploy only from a clean, fetched branch through the repository’s connected Lovable
workflow. Roll back application code with a forward revert commit. Database changes are additive;
disable public functions or policies with a forward migration before removing data.
