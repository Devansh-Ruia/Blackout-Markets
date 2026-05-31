# Customer Data Request

Send three files using the templates in [../templates/](../templates/):

- [workloads_template.csv](../templates/workloads_template.csv)
- [regions_template.csv](../templates/regions_template.csv)
- [policy_template.json](../templates/policy_template.json)

The template CSV files include one example row. Remove the example row before sending real data.

## Files Needed

- `workloads.csv`: historical GPU workload records from the review period.
- `regions.csv`: region or cluster assumptions for price, carbon, capacity, grid stress, and optional latency or reliability.
- `policy.json`: constraints Blackout should apply during the shadow diagnostic.

## Required Fields

`workloads.csv` requires:

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

`regions.csv` requires:

- `region`
- `electricity_price_per_kwh`
- `carbon_intensity_g_per_kwh`
- `gpu_available`
- `grid_stress`

`policy.json` should include:

- `max_delay_minutes`
- `allowed_regions`
- `blocked_regions`
- `carbon_ceiling_g_per_kwh`
- `max_latency_ms`
- `require_manual_for_low_confidence`

## Optional Fields

`workloads.csv` can include:

- `customer_id`
- `deadline_minutes_from_now`
- `allowed_regions`
- `max_latency_ms`
- `data_residency_region`
- `estimated_revenue_usd`

`regions.csv` can include:

- `pue`
- `avg_latency_ms`
- `reliability_score`

Optional fields improve data quality, but the diagnostic can still run without many of them.

## Anonymization

- `customer_id` can be hashed.
- `workload_id` values can be randomized through the `id` field.
- Exact revenue can be omitted by leaving `estimated_revenue_usd` blank.
- Model names and customer names should be removed from `workload_type`, `customer_id`, and any internal notes before sharing.
- Workload types can be coarse labels such as `training`, `batch`, `eval`, `embedding_batch`, or `online_inference`.
- Region names should remain specific enough to map to energy, latency, carbon, and capacity assumptions. Avoid replacing all regions with generic labels.

## Do Not Include

Do not share secrets, credentials, API keys, private prompts, model contents, user data, training data, source code, private URLs, scheduler tokens, production kubeconfigs, SSH material, billing account credentials, or raw customer names.

## Example Export Workflow

1. Pick one recent operating window, usually 7 to 14 days.
2. Export completed and queued GPU jobs from the scheduler, platform database, or warehouse.
3. Map each job to the `workloads.csv` fields. Keep one row per workload.
4. Export or estimate region assumptions for the same period.
5. Fill `policy.json` with the constraints your team would have required during that period.
6. Remove example rows from the templates.
7. Check that IDs are anonymized and that no secrets or user data are present.
8. Send the three files through the agreed private channel.

## Expected Turnaround

For a clean first export, expect one business day to validate the files and generate the first diagnostic. If field mapping is unclear or the data needs cleanup, expect another one to three business days before a useful review.

## Security Notes

Blackout only needs operational metadata for the diagnostic. It does not need model weights, prompts, user payloads, source code, credentials, or direct access to production systems. Share the smallest dataset that can answer the placement question.

## What The Diagnostic Does Not Claim

The diagnostic does not claim exact billing savings, carbon accounting truth, demand response revenue, production safety, or scheduler readiness. It estimates what Blackout would have recommended in shadow mode and identifies what needs validation before any production use.
