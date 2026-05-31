# Two-Week Pilot Scope

## Objective

Run Blackout in shadow mode on recent GPU workload data to identify movable or deferrable workload classes, estimate the savings range for those workloads, and find blockers that would prevent safe automation.

## Customer Responsibilities

- Provide `workloads.csv`, `regions.csv`, and `policy.json`.
- Confirm which workload types are in scope.
- Explain current placement, retry, queueing, and priority rules.
- Review diagnostic findings with infrastructure, scheduler, and finance owners.
- Validate whether estimated savings align with billing and operations context.

## Blackout Responsibilities

- Validate the submitted files.
- Run the retrospective diagnostic on fixture and customer data.
- Produce `report.json`, `recommendations.csv`, and `diagnostic.md`.
- Review findings with the customer team.
- Identify missing data, unsafe assumptions, and automation blockers.
- Recommend a narrow next pilot scope if the data supports it.

## Data Needed

- One recent 7 to 14 day workload window.
- Region or cluster assumptions from the same period.
- Current policy constraints for movement, delay, latency, carbon, and manual review.
- Optional billing or internal rate context for validating the savings range.

## Timeline

Day 1 to 2: confirm scope, data fields, anonymization, and transfer path.

Day 3 to 5: receive files, validate inputs, resolve field mapping gaps.

Day 6 to 8: run diagnostic, inspect data quality, and review report outputs.

Day 9 to 10: review findings with platform, scheduler, finance, and operations owners.

Day 11 to 14: finalize pilot readout, blockers, and recommended next step.

## Success Metrics

- Classify at least 90% of valid workloads.
- Identify movable or deferrable workload classes.
- Estimate savings range on movable workloads.
- Produce zero production impact because shadow mode only.
- Identify blockers that prevent automation.

## Excluded Scope

- Live scheduling.
- Production job movement.
- Cloud provider integration.
- Kubernetes, Ray, or Slurm controller work.
- Forecasting.
- Billing reconciliation.
- Demand response revenue.
- Auth, billing, marketplace, or admin features.

## Risks To Watch

- Missing or unreliable workload duration data.
- Region labels that cannot map to energy or capacity assumptions.
- Policy constraints that are not captured in the export.
- Latency or data residency requirements hidden outside the scheduler.
- Savings estimates that do not match actual billing mechanics.
- Manual approval paths that are required for critical workloads.

## Final Deliverables

- Validated customer input notes.
- Diagnostic Markdown report.
- Recommendation CSV.
- Full JSON report.
- Summary of movable, deferrable, pinned, and manual-review workload classes.
- Data quality and blocker list.
- Recommendation for whether to continue, narrow the scope, or stop.
