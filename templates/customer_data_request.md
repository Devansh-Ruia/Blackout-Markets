# Blackout Markets Customer Data Request

Send three files:

- `workloads.csv`
- `regions.csv`
- `policy.json`

Use the templates in this directory. The CSV parser does not support commented rows, so remove the example row before sending real data.

## Workload File

Required workload fields:

- `id`
- `workload_type`
- `gpu_type`
- `gpu_count`
- `expected_duration_minutes`
- `current_region`
- `priority`
- `latency_sensitive`
- `can_delay`
- `can_move`
- `checkpointable`

Optional workload fields:

- `customer_id`
- `deadline_minutes_from_now`
- `allowed_regions`
- `max_latency_ms`
- `data_residency_region`
- `estimated_revenue_usd`

Use `allowed_regions` as pipe-separated values, for example `us-east-1|us-west-2`. If `latency_sensitive` is `true`, include `max_latency_ms`.

## Region File

Required region fields:

- `region`
- `electricity_price_per_kwh`
- `carbon_intensity_g_per_kwh`
- `gpu_available`
- `grid_stress`

Optional region fields:

- `pue`
- `avg_latency_ms`
- `reliability_score`

Keep region names real enough to map to energy data. Missing PUE uses the default PUE assumption in the report.

## Policy File

`policy.json` controls the shadow analysis:

- `max_delay_minutes`
- `allowed_regions`
- `blocked_regions`
- `carbon_ceiling_g_per_kwh`
- `max_latency_ms`
- `require_manual_for_low_confidence`

Empty `allowed_regions` means every uploaded region can be considered unless another rule blocks it.

## What Can Be Anonymized

- `customer_id` can be hashed.
- Workload IDs can be random.
- Exact revenue can be omitted.
- Model names and customer names should be removed.
- Workload type names can be coarse, such as `embedding_batch`, `eval`, `training`, or `online_inference`.
- Region names should stay real enough to match energy and latency data.

## What Not To Include

Do not include secrets, credentials, API keys, customer names, model contents, private prompts, training data, user data, source code, private URLs, or production scheduler tokens.

## How Blackout Uses The Data

Blackout runs an offline shadow report. It estimates what it would have recommended for the uploaded workload history, then shows savings estimates, carbon estimates, data quality warnings, blockers, and a suggested pilot scope.

## What The Diagnostic Does Not Do

It does not move jobs, call cloud APIs, reconcile utility bills, forecast energy prices, reserve real capacity, schedule production workloads, or count demand response revenue. Cost and carbon estimates require validation against actual billing and operational data.
