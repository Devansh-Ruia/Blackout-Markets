# Blackout Markets

Retrospective shadow optimization for GPU infrastructure conversations.

Blackout answers:

```text
Given last week's workload logs and region energy/capacity data, what would Blackout have recommended, what would it have saved, and which workloads could not safely move?
```

Shadow mode only. No jobs are moved. The app uses uploaded customer data and policy settings to produce an offline report for review. It is not live scheduling, billing, carbon accounting, or production automation.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm start
```

Development runs:

- Web UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

`npm start` runs the API server. After `npm run build`, the API also serves the built web UI from `dist-web`.

## What Shadow Mode Means

Shadow mode uses historical workload logs and uploaded region data to estimate what Blackout would have recommended.

- No jobs are moved.
- No production schedulers are called.
- No cloud inventory is queried.
- No capacity is reserved outside the report.
- Recommendations must be reviewed before production use.
- Cost and carbon numbers are estimates from uploaded inputs.

The report is for decision support, not exact billing.

## Run Retrospective Analysis

1. Upload a workload CSV from the period you want to review.
2. Upload a region CSV with electricity price, carbon intensity, GPU capacity, grid stress, and optional PUE/latency/reliability data.
3. Configure policy constraints in the UI or upload a `policy.json` through the API.
4. Click `Run retrospective report`.
5. Review the batch estimate, recommendation mix, confidence counts, priority breakdown, blockers, savings breakdowns, and workload rows.
6. Export JSON or CSV for the customer conversation.

The UI does not silently load demo data. Fixture files must be uploaded manually.

## Workload CSV

Required headers:

```csv
id,workload_type,gpu_type,gpu_count,expected_duration_minutes,current_region,priority,latency_sensitive,can_delay,can_move,checkpointable
```

Optional headers:

```csv
customer_id,deadline_minutes_from_now,allowed_regions,max_latency_ms,data_residency_region,estimated_revenue_usd
```

Rules:

- `gpu_count` must be an integer greater than `0`.
- `expected_duration_minutes` must be greater than `0`.
- `deadline_minutes_from_now`, `max_latency_ms`, and `estimated_revenue_usd` must be `>= 0` when present.
- `priority` must be `low`, `normal`, `high`, or `critical`.
- Boolean fields must be `true` or `false`.
- `allowed_regions` uses pipe-separated region names, for example `us-east-1|us-west-2`.
- Duplicate workload IDs are rejected.
- `max_latency_ms` is required when `latency_sensitive=true`.

## Region CSV

Required headers:

```csv
region,electricity_price_per_kwh,carbon_intensity_g_per_kwh,gpu_available,grid_stress
```

Optional headers:

```csv
pue,avg_latency_ms,reliability_score
```

Rules:

- `electricity_price_per_kwh` and `carbon_intensity_g_per_kwh` must be `>= 0`.
- `gpu_available` must be an integer `>= 0`.
- `grid_stress` must be `low`, `medium`, or `high`.
- `pue` must be `>= 1` when present.
- `avg_latency_ms` must be `>= 0` when present.
- `reliability_score` must be from `0` to `1` when present.

## Policy JSON

The UI sends this policy shape:

```json
{
  "max_delay_minutes": 60,
  "allowed_regions": [],
  "blocked_regions": [],
  "carbon_ceiling_g_per_kwh": null,
  "max_latency_ms": null,
  "require_manual_for_low_confidence": true
}
```

Empty `allowed_regions` means every uploaded region is eligible unless blocked by another rule.

Invalid policy combinations are reported in `validation_errors`. Examples include a region being both allowed and blocked, negative limits, unknown region references, or a policy that leaves no usable region.

## Batch Capacity Reservation

Capacity is reserved within a single batch report. The optimizer does not solve global bin packing.

Processing order is deterministic:

1. `critical`
2. `high`
3. `normal`
4. `low`

Within the same priority, input order is stable.

When a workload is assigned to `move_region`, `run_now`, or `pinned`, the workload's `gpu_count` is subtracted from that region's remaining capacity. `delay`, `manual_review`, and `invalid` rows do not reserve capacity because they are not automatic assignments.

Rows expose capacity evidence:

- `capacity_checked`
- `capacity_reserved`
- `remaining_region_capacity_after_assignment`
- `capacity_reason`

Example reason:

```text
Cannot move because us-west-2 does not have enough remaining GPU capacity.
```

## Cost, Carbon, And PUE

The estimate is deliberately simple:

```text
estimated_kwh = gpu_count * expected_duration_hours * gpu_kwh_assumption * pue
cost_usd = estimated_kwh * electricity_price_per_kwh
carbon_g = estimated_kwh * carbon_intensity_g_per_kwh
```

Defaults:

```text
gpu_kwh_assumption = 0.7 kWh per GPU-hour
default_pue = 1.2
```

If a region row has `pue`, that row uses the uploaded value. If `pue` is missing, the row uses `default_pue`.

Estimated savings count only valid automatic `move_region` recommendations that reduce estimated dollar cost. The report does not count delayed workloads without forecast data, manual review opportunities, pinned workloads, invalid rows, or moves that do not reduce estimated cost.

## Report Shape

Top-level report fields:

- `generated_at`
- `raw_policy`
- `assumptions`
- `workload_input_summary`
- `region_input_summary`
- `summary`
- `aggregate_report_summary`
- `breakdowns`
- `recommendations`
- `rows`
- `validation_errors`

Summary includes:

- total, valid, and invalid workloads
- `run_now`, `delay`, `move_region`, `manual_review`, and `pinned` counts
- estimated baseline cost, recommended cost, savings, and savings percentage
- estimated baseline carbon, recommended carbon, and carbon delta
- movable and pinned percentages
- capacity, latency, policy, and data residency blocker counts

Breakdowns include:

- savings by workload type
- savings by current region
- savings by recommended region
- recommendation counts by type
- recommendation counts by priority
- confidence counts
- top reasons workloads could not move
- top estimated savings opportunities
- workloads excluded from estimated savings

## Exports

The full JSON export is the `RetrospectiveReport` object and includes raw policy, assumptions, input summaries, per-workload recommendations, aggregate summary, validation errors, and `generated_at`.

The workload CSV export includes:

```csv
id,workload_type,priority,current_region,recommended_region,recommendation,confidence,reason,baseline_cost,recommended_cost,estimated_savings,baseline_carbon,recommended_carbon,carbon_delta,delay_minutes,valid,validation_errors
```

Invalid workloads appear in exports with `valid=false` and row validation messages.

## API

`POST /api/report/retrospective`

Multipart fields:

- `workloads`: workload CSV file
- `regions`: region CSV file
- `policy`: JSON policy string
- `gpu_kwh_assumption`: optional number
- `default_pue`: optional number

JSON input is also supported:

```json
{
  "workloads": [],
  "regions": [],
  "policy": {},
  "gpu_kwh_assumption": 0.7,
  "default_pue": 1.2
}
```

`POST /api/export/report/workloads.csv`

Body:

```json
{
  "rows": []
}
```

Returns one CSV row per workload recommendation.

The older `POST /api/optimize` endpoint remains for the original recommendation flow and now reserves capacity across its batch.

## Fixture Datasets

Fixture sets live under `fixtures/`. Upload their files manually through the UI or use them in tests.

- `fixtures/normal-week/`
  - mixed workload types
  - moderate prices and savings
  - some pinned workloads
- `fixtures/grid-stress-week/`
  - high electricity price, carbon, and grid stress in one region
  - move and manual review recommendations
  - enough workloads to show capacity reservation
- `fixtures/policy-heavy-week/`
  - blocked regions
  - data residency
  - latency-sensitive jobs
  - critical priority jobs
  - policy preventing unsafe moves

Each set contains:

- `workloads.csv`
- `regions.csv`
- `policy.json`
- `expected-notes.md`

The old root-level `fixtures/workloads.csv` and `fixtures/regions.csv` remain as small smoke-test inputs.

## Known Limits

- No live cloud inventory.
- No forecast integration.
- No automatic production scheduling.
- No live migration.
- Cost and carbon are estimates.
- Capacity reservation is simple and batch-local.
- No actual energy procurement or demand response integration.
- No Kubernetes controller.
- No Ray integration.
- No Slurm integration.
- No marketplace, auth, or billing features.
