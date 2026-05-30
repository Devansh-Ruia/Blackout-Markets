# Blackout Markets

Shadow optimizer for GPU infrastructure scheduling decisions.

This MVP ingests workload CSV and region CSV files, applies policy constraints, runs scheduling recommendations, and exports JSON or CSV reports. It is a review tool before automation, not a marketplace, live migration system, or carbon accounting product.

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

`npm start` runs the API server. If `npm run build` has been run, the server also serves the built web UI from `dist-web`.

Small CSV fixtures are available in `fixtures/` for a smoke test.

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

Invalid policy combinations are reported before recommendations are accepted. Examples include a region being both allowed and blocked, negative limits, or a policy that leaves no usable region.

## Optimizer Behavior

Classification values:

- `run_now`
- `delay`
- `move_region`
- `manual_review`
- `pinned`
- `invalid`

Hard rules:

- Workloads with `can_move=false` do not move.
- Workloads with `can_delay=false` do not delay.
- A workload never moves outside its workload-level `allowed_regions`.
- A workload never moves into a policy-blocked region.
- A workload with `data_residency_region` is pinned to that region.
- A workload never moves to a region without enough available GPUs.
- A workload never delays past its deadline.
- Latency-sensitive workloads do not move above their latency limit.
- Critical workloads default to `run_now` or `manual_review` instead of automatic risky moves.

When multiple regions are valid, the optimizer chooses the lowest weighted score using:

- estimated energy cost
- carbon intensity
- grid stress
- reliability score

High grid stress and low reliability reduce confidence. Low-confidence moves go to `manual_review` when the policy requires approval.

## Cost Formula

The estimate is deliberately simple:

```text
estimated_kwh = gpu_count * expected_duration_hours * gpu_kwh_assumption * pue
cost_usd = estimated_kwh * electricity_price_per_kwh
carbon_g = estimated_kwh * carbon_intensity_g_per_kwh
```

Default assumption:

```text
gpu_kwh_assumption = 0.7 kWh per GPU-hour
```

If a user enters a GPU kWh assumption, the report marks the source as `user`; otherwise it marks it as `default`.

## API

`POST /api/optimize`

Multipart fields:

- `workloads`: workload CSV file
- `regions`: region CSV file
- `policy`: JSON policy string
- `gpu_kwh_assumption`: optional number

Response:

```ts
OptimizationReport
```

The report includes assumptions, summary metrics, recommendations, and validation errors.

`POST /api/export/csv`

Body:

```json
{
  "recommendations": []
}
```

Returns CSV rows with recommendation reasons.

## Known Limits

- No live cloud inventory integration.
- No power forecast integration.
- Delay recommendations do not claim future power prices or carbon will improve; they only mark that waiting is policy-safe.
- GPU kWh is a user/default assumption, not exact billing.
- Capacity is evaluated per workload against uploaded region capacity. This MVP does not reserve capacity across the full batch.
- No authentication or tenancy model.
