# Blackout Markets Overview

## What Blackout Does

Blackout Markets runs a retrospective shadow diagnostic on GPU workload logs. It estimates what Blackout would have recommended for last week or another historical period, using uploaded workload, region, and policy data.

The output is a report for infrastructure and finance review. It shows which workloads looked movable, which were pinned, what blockers appeared, what savings range is plausible for movable workloads, and what a safe pilot should test first.

## What Blackout Does Not Do

Blackout does not move jobs, call schedulers, reserve real capacity, query cloud inventory, forecast power prices, reconcile bills, run a marketplace, or automate production scheduling. Cost and carbon numbers are estimates based on uploaded inputs.

## Who It Is For

Blackout is for teams that operate meaningful GPU capacity and have enough historical job data to review placement decisions:

- CTOs and infrastructure leaders deciding whether GPU placement can be improved.
- ML platform engineers who own job metadata and runtime constraints.
- Scheduler owners who understand placement, queueing, retry, and migration rules.
- FinOps and finance leads who need cost and utilization evidence.
- Energy or data center operators who track capacity, power price, and grid constraints.

## Data It Needs

Blackout needs three files:

- `workloads.csv`: historical jobs, GPU counts, durations, regions, priority, and movement constraints.
- `regions.csv`: region-level electricity price, carbon intensity, GPU availability, grid stress, and optional latency or reliability data.
- `policy.json`: delay limits, allowed or blocked regions, carbon ceiling, latency limits, and manual review settings.

Templates live in [../templates/](../templates/).

## What The Diagnostic Produces

The diagnostic produces:

- `report.json`: full structured retrospective report.
- `recommendations.csv`: one row per workload recommendation.
- `diagnostic.md`: readable customer-facing summary.

The report includes data quality warnings, top blockers, estimated savings range, estimated carbon impact, assumptions, excluded savings, and a suggested pilot scope.

## What A Design Partner Gets

A design partner gets a private review of historical workload data, a sample diagnostic report, a clear list of missing data or automation blockers, and a practical pilot scope. The work stays in shadow mode unless both sides separately agree to production integration.

## Two-Week Pilot

A two-week pilot should use one recent workload window, one policy file, and the current region or cluster assumptions. Blackout runs the diagnostic, reviews findings with the customer, tunes assumptions where needed, and identifies workload classes that are safe candidates for later automation.

## Success

Success means the diagnostic classifies at least 90% of valid workloads, identifies movable or deferrable workload classes, estimates a savings range for movable workloads, produces zero production impact because it is shadow mode only, and exposes the blockers that would prevent safe automation.
