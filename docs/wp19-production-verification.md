# WP19 production publication verification

## Baseline

- Protected main at verification start: `37d3bd5`
- Required checks: `build`, `test`, `lint`, `supabase-migrations`
- Supabase project: `gvrwrqcftlaavxarmgfk`
- Geographic Dispensing Potential model: `gdp-v1.0.0`
- Calibration observations: zero
- Application tests at start: 67

## Deployment state

The previously documented Lovable URL, `https://chemistacquisitions.lovable.app`, returned HTTP 404
with “Project not found” on 29 July 2026. No deployment identity, anonymous behaviour, authenticated
organisation isolation, browser performance or responsive layout can truthfully be verified against
that unavailable deployment.

Owner action: publish the latest protected-main commit in Lovable and confirm the resulting production
URL. This is one action, regardless of how many unpublished commits precede the latest commit.

## Hardening delivered

- `/build.json` exposes a cache-disabled, credential-free deployment identity for automated checks.
- `npm run verify:production` compares deployed commit and Supabase project with expected values and
  fails closed when the deployment is unavailable, stale or incompatible.
- `npm run lint` now archives and removes AppleDouble metadata before ESLint. This prevents a clean
  checkout on the external macOS volume from failing on filesystem-generated `._*` files.

Example after publication:

```sh
PRODUCTION_URL=https://the-published-host.example \
EXPECTED_COMMIT=PROTECTED_MAIN_SHA \
npm run verify:production
```

Passing the identity check is necessary but not sufficient. The anonymous/authenticated, desktop/mobile,
console/network and organisation-isolation matrix in the sprint brief still requires the published URL
and an authorised test account. Until then, the frontend must be described as merged but unpublished.
