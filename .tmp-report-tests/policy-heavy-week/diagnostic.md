# Blackout Markets Diagnostic Report

Generated: 2026-06-04T04:15:29.720Z

## Executive Summary

Based on uploaded data, Blackout found 1 move recommendations and $1.25 in expected estimated savings. This requires validation against actual billing.

Shadow mode only. No jobs are moved.

## Workload Flexibility

60% of valid workloads appear movable. 20% are pinned by workload or residency constraints.

Top movable workload types:

- batch: $1.25 estimated savings across 2 workloads.

Top pinned workload types:

- training: 1

## Estimated Savings

- Low estimate: $0.63
- Expected estimate: $1.25
- High estimate: $1.56

This is a rough planning range, not billing truth. Validate against actual billing before using it for commitments.

Estimated carbon impact: -4,746 g estimated carbon delta based on uploaded region data.

## Data Quality

Data quality: high (100/100)

Reasons:

- Uploaded data is strong enough for a focused pilot discussion.

Warnings:

- None.

## Top Blockers

- Cannot move because latency policy would be exceeded. (4)
- Cannot move because policy blocks the available target regions. (4)
- Cannot move because the carbon ceiling blocks target regions. (4)
- Cannot move because data residency pins this workload to eu-west-1. (1)
- Pinned because can_move is false; workload cannot move. (1)

## Best Pilot Candidate

Start with batch workloads in us-central-1.

Run for 2 weeks in shadow mode.

Success metric: 15% estimated cost reduction on movable workloads with no SLA impact.

Reason: batch has the strongest counted savings among non-critical, non-latency-sensitive movable workloads.

Do not include priority levels: critical.

Exclude workload types for now: inference, training.

Risks to watch:

- Validate against actual billing.
- Watch SLA and latency impact.
- Capacity reservation is batch-local, not live inventory.

## Assumptions

- GPU energy assumption: 0.7 kWh per GPU-hour (default).
- Default PUE: 1.2; uploaded region PUE is used when present.
- estimated_kwh = gpu_count * expected_duration_hours * gpu_kwh_assumption * pue; cost_usd = estimated_kwh * electricity_price_per_kwh
- carbon_g = estimated_kwh * carbon_intensity_g_per_kwh
- Delay savings are not counted unless future forecast data is provided.

Policy constraints applied:

- Max delay: 90 minutes.
- Allowed regions: us-east-1, us-central-1, eu-west-1.
- Blocked regions: us-west-2.
- Carbon ceiling: 250 g/kWh.
- Max latency: 60 ms.
- Low-confidence moves require manual review.

## What This Report Does Not Claim

- Delay savings: Delay savings are not counted because forecast data was not provided.
- Demand response revenue: Demand response revenue is not counted because no utility or market program data was uploaded.
- Utility bill reconciliation: Utility bill reconciliation is not included.
- Live cloud inventory: Live cloud inventory is not included.
- Capacity reservation: Capacity is batch-local in this report, not a real reservation system.
- Customer contract pricing: Customer contract pricing is not included unless reflected in uploaded energy prices.
- Cooling estimates: Cooling estimates use uploaded PUE or the default PUE assumption.

## Recommended Next Step

Start with batch in us-central-1 for 2 weeks in shadow mode.
