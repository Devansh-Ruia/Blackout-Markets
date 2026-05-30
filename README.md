# Blackout Markets

Retrospective savings report for GPU infrastructure scheduling decisions.

The app answers:

```text
Given last week's workload logs and current/historical region energy data, what would Blackout Markets have recommended, what would it have saved, and which workloads were blocked by policy, latency, capacity, or risk?
```

This is a review tool for ML infrastructure teams after customer calls. It estimates scheduling recommendations from uploaded CSV files. It is not live job control, billing, or carbon accounting.

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

## Retrospective Mode

Use the UI:

1. Upload a workload CSV from last week.
2. Upload a region CSV with current or historical price, carbon, capacity, latency, PUE, and reliability data.
3. Configure policy constraints.
4. Click `Run retrospective report`.
5. Review summary, recommendation mix, savings breakdowns, blockers, top opportunities, and workload details.
6. Export the full report JSON or workload report CSV.

The baseline is the workload running in `current_region` with the uploaded region assumptions. The recommended case is the optimizer-selected action: `run_now`, `move_region`, `delay`, `manual_review`, `pinned`, or `invalid`.

Batch capacity is reserved during report generation. If a region has 8 GPUs available, the report will not recommend ten separate 8-GPU moves into that region. When a destination fills, the next workload uses the next valid region or falls back to `manual_review` or `run_now`.

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

## Policy Fields

The UI sends this policy shape to the API:

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

## Report Fields

Top-level report:

- `generated_at`
- `assumptions`
- `summary`
- `breakdowns`
- `rows`
- `validation_errors`

Summary fields:

- `total_workloads`, `valid_workloads`, `invalid_workloads`
- `run_now_count`, `move_region_count`, `delay_count`, `manual_review_count`, `pinned_count`
- `movable_count`, `movable_percent`, `pinned_percent`
- `baseline_cost_usd`, `recommended_cost_usd`, `hard_savings_usd`, `hard_savings_percent`
- `baseline_carbon_g`, `recommended_carbon_g`, `carbon_delta_g`, `carbon_delta_percent`
- `average_confidence`
- `policy_violation_count`, `capacity_blocked_count`, `latency_blocked_count`, `data_residency_blocked_count`

Breakdowns:

- `savings_by_workload_type`
- `savings_by_current_region`
- `savings_by_recommended_region`
- `recommendations_by_type`
- `blocked_reasons_count`
- `confidence_breakdown`
- `policy_violations`
- `top_savings_opportunities`
- `workloads_excluded_from_savings`

Each workload row includes workload identity, customer ID when present, GPU shape, duration, current and recommended region, recommendation type, baseline cost, recommended cost, hard savings, baseline carbon, recommended carbon, carbon delta, confidence, reason, blocked reasons, `counted_in_savings`, validity, priority, and row-level assumptions.

## Hard Savings

`hard_savings_usd` counts only valid automatic `move_region` recommendations with concrete current and recommended region data. It is calculated as:

```text
baseline_cost_usd - recommended_cost_usd
```

The report excludes these from hard savings:

- invalid workloads
- `delay` recommendations without future forecast data
- `manual_review` recommendations until an operator approves the move
- recommendations that violate policy
- recommendations with no concrete recommended region
- rows where the move does not reduce dollar cost

Delay rows without forecast data use this reason:

```text
This delay is not counted because no forecast data was provided.
```

`hard_savings_percent` is measured against the baseline cost of workloads counted in hard savings, not every uploaded workload.

## Cost And Carbon Math

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

If a region row has `pue`, the row uses that value and marks `pue_source` as `region`. If `pue` is missing, the row uses `default_pue` and marks `pue_source` as `default`.

This is an estimate from uploaded inputs. Do not treat it as actual utility billing.

## API

`POST /api/report/retrospective`

Multipart fields:

- `workloads`: workload CSV file
- `regions`: region CSV file
- `policy`: JSON policy string
- `gpu_kwh_assumption`: optional number
- `default_pue`: optional number

JSON input is also supported with:

```json
{
  "workloads": [],
  "regions": [],
  "policy": {},
  "gpu_kwh_assumption": 0.7,
  "default_pue": 1.2
}
```

Response:

```ts
RetrospectiveReport
```

`POST /api/export/report/workloads.csv`

Body:

```json
{
  "rows": []
}
```

Returns one CSV row per workload report item.

The old `POST /api/optimize` and `POST /api/export/csv` endpoints remain for the original recommendation flow.

## Fixtures

Fixtures live in `fixtures/`:

- `workloads.csv` and `regions.csv`: small original smoke test.
- `normal-week-workloads.csv` and `normal-week-regions.csv`: balanced week.
- `grid-stress-week-workloads.csv` and `grid-stress-week-regions.csv`: capacity reservation and grid stress.
- `policy-heavy-week-workloads.csv`, `policy-heavy-week-regions.csv`, and `policy-heavy-policy.json`: data residency, latency, blocked region, carbon ceiling, and critical workload review.

## Known Limits

- No live cloud inventory.
- No real utility billing integration.
- No forecast-based delay savings unless future data is added.
- No live job movement.
- No direct Kubernetes, Ray, or Slurm control yet.
- No authentication or tenant isolation.
- Estimates depend on input data quality.
