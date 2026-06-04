# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Blackout Markets runs a **retrospective shadow diagnostic** on uploaded GPU workload, region, and policy data. It estimates what region/timing recommendations would have applied historically, how much they might have saved, and how trustworthy the inputs are. It produces an offline report only — no jobs move, no schedulers/cloud/billing are called. Cost and carbon are estimates, not billing truth.

## Commands

```bash
npm install
npm run dev            # concurrently runs API (tsx watch, :3001) + Vite web (:5173)
npm run dev:server     # API only
npm run dev:web        # web only (proxies /api -> 127.0.0.1:3001)
npm test               # vitest run (all src/**/*.test.ts)
npm run test:watch     # vitest watch
npm run build          # tsc --noEmit type-check, then vite build -> dist-web/
npm start              # run API; serves dist-web/ as static if built
```

Single test file / single test:

```bash
npx vitest run src/domain/retrospective.test.ts
npx vitest run -t "name of the test"
```

CLI report (no server needed):

```bash
npm run report -- --workloads fixtures/normal-week/workloads.csv --regions fixtures/normal-week/regions.csv --policy fixtures/normal-week/policy.json --out reports/normal-week
npm run demo:reports   # regenerates reports/demo/{normal-week,grid-stress-week,policy-heavy-week}
```

Optional CLI assumptions: `--gpu-kwh-assumption <num>` (default 0.7), `--default-pue <num>` (default 1.2). CLI exits nonzero on missing input path, unparseable CSV, invalid policy JSON, or cross-file validation failure.

## Architecture

Pipeline (same for CLI, server, and demo): **parse CSV/policy → validate → build report → serialize (JSON / CSV / Markdown)**. All decision logic lives in `src/domain/`; `src/server/` and `src/cli/` are thin adapters over it.

- `src/domain/csv.ts` — `parseWorkloadCsv` / `parseRegionCsv`. Return `ParseResult<T>` = `{ rows, errors, invalid_rows }`. Bad rows become `invalid_rows`, they do not throw.
- `src/domain/policy.ts` — `readPolicy` (accepts JSON string or object) and `defaultPolicy`.
- `src/domain/validation.ts` — `validateDataset` cross-checks workloads/regions/policy together (e.g. region both allowed+blocked, unknown region refs, no usable region).
- `src/domain/retrospective.ts` — **`buildRetrospectiveReport`, the current engine.** Per-workload `recommendationForWorkload` decides `run_now | delay | move_region | manual_review | pinned | invalid`, then aggregates into the `RetrospectiveReport`.
- `src/domain/diagnostic.ts` — customer-facing layer: `buildDiagnosticReport`, `assessDataQuality`, `recommendPilot`, `buildSavingsRange`, `notCountedSavings`, `diagnosticReportToMarkdown`.
- `src/domain/report.ts` — re-exports the above plus CSV serializers (`workloadReportRowsToCsv`, `recommendationsToCsv`).
- `src/domain/types.ts` — single source of truth for all data shapes. `RetrospectiveReport` is the full export object.
- `src/domain/optimizer.ts` — **legacy engine** behind `POST /api/optimize` only. See gotcha below.
- `src/server/index.ts` — `createApp()` (Express). Routes: `/api/report/retrospective` (multipart files **or** JSON body), `/api/optimize` (legacy), `/api/export/csv`, `/api/export/report/workloads.csv`, `/api/export/report/diagnostic.md`, `/api/health`. Uploads via multer memory storage, 4 MB cap.
- `src/web/` — React + Vite single-page UI (`App.tsx`). Does **not** auto-load fixtures; user uploads files manually.

### Critical gotcha: two parallel recommendation engines

`optimizer.ts` (`optimize`, legacy, `/api/optimize`) and `retrospective.ts` (`buildRetrospectiveReport`, current, everything else) contain **near-duplicate decision logic** — `effectiveAllowedRegions`, `scoreTarget`, `confidenceFor`, `moveReason`, `canDelayWithinDeadline`, capacity reservation, the `stressWeight`/`priorityRank` constants, and the whole branch order in `optimizeOne` vs `recommendationForWorkload` are copy-paste twins. **Any change to recommendation behavior must be mirrored in both, or the two endpoints diverge.** New work should target `retrospective.ts`.

### Determinism is a contract

Output must be reproducible: workloads are processed in fixed priority order (`critical > high > normal > low`, stable within priority), capacity is reserved greedily in that order (batch-local, not global bin packing), and ties in region scoring break on `region.localeCompare`. Tests assert exact numbers/strings — don't introduce nondeterminism (the one expected exception is `generated_at`; pass `generated_at` into `buildRetrospectiveReport` to make a run fully deterministic).

### Estimation model (keep simple)

```
estimated_kwh = gpu_count * expected_duration_hours * gpu_kwh_assumption * pue
cost_usd      = estimated_kwh * electricity_price_per_kwh
carbon_g      = estimated_kwh * carbon_intensity_g_per_kwh
```

Region `pue` overrides `default_pue` (1.2). `gpu_kwh_assumption` default 0.7. **Savings count only valid automatic `move_region` rows whose cost actually drops** (`counted_in_savings`); delayed/pinned/manual/invalid rows and non-improving moves are excluded. The savings *range* is `low = expected*0.5`, `high = expected*1.25`, clamped at 0.

## Conventions

- Money/kWh round to 4 places, carbon (grams) to 2 — via the local `round()` helper present in each domain module.
- Strict TypeScript, ESM (`"type": "module"`), `.js`-less relative imports resolved by tsx/Vite.
- Recommendation `reason` / `policy_reason` strings are user-facing and asserted verbatim in tests — edit them deliberately.
- Fixtures under `fixtures/{normal-week,grid-stress-week,policy-heavy-week}/` each ship `workloads.csv`, `regions.csv`, `policy.json`, `expected-notes.md`; tests and demos consume them.
- CSV inputs reject duplicate workload IDs; `max_latency_ms` is required when `latency_sensitive=true`. Full input schema lives in `README.md`.
