# Release Checklist

Run from the repo root before tagging a local release.

## Required Checks

- `npm test`
- `npm run build`
- `npm audit`
- `npm run demo:reports`
- Smoke test upload -> policy -> report in the web app.
- Inspect generated `reports/demo/*/diagnostic.md` files.
- Verify README links to CLI usage, demo reports, templates, and design-partner docs.
- Verify no secrets in fixtures, reports, templates, or design-partner docs.
- Verify product boundaries are still intact: no live scheduling, auth, billing, forecasting, marketplace, database, or cloud integration.

## Local Tag

Tag locally after the checks pass:

```bash
git tag v0.3-diagnostic
```

Do not push tags automatically. Push only after the release owner approves it.
