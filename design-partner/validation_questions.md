# Validation Questions

## CTO / VP Infrastructure

- Walk me through how a GPU job gets placed today.
- Where do placement mistakes show up first?
- Which workload classes are most expensive to run in the wrong place?
- What has to be true before your team trusts a placement recommendation?
- What would make this unsafe to use?
- What would stop your team from running this on last week's logs?
- Which teams would need to approve a shadow-mode pilot?
- What would count as a useful result after two weeks?

## ML Platform Engineer

- Which job fields are reliable in your logs?
- Which jobs can wait, retry, or move?
- Which jobs should never move after submission?
- Where are latency, data residency, and priority rules stored today?
- How do checkpointing and retry behavior differ by workload type?
- What metadata is missing when a job is submitted?
- How often do users override scheduler defaults?
- What would you want to inspect before trusting a recommendation?

## Scheduler Owner

- How does the scheduler choose a region, cluster, or queue today?
- What constraints are enforced by the scheduler versus external policy?
- Where does capacity information come from?
- How do you handle partial capacity, backfill, and queue pressure?
- Which placement decisions are deterministic, and which depend on runtime state?
- What would be hard to reproduce from historical logs?
- How are failed moves, retries, and preemptions represented?
- What would need to change before a recommendation could become an action?

## FinOps Or Finance Lead

- Where do GPU infrastructure costs show up in your P&L?
- Which costs are visible per job, per team, or per region?
- How do internal rates differ from actual cloud or data center costs?
- What savings evidence would be credible to finance?
- Which savings should not be counted without billing validation?
- How do commitments, reserved capacity, or contracts change the cost model?
- Who owns the decision to act on estimated savings?
- What reporting format would make this useful for review?

## Energy Or Data Center Operator

- Which power, carbon, or grid stress signals are available by region or site?
- How often do those signals change in a way that matters for GPU placement?
- What capacity limits should a shadow diagnostic respect?
- Where do cooling, PUE, and reliability assumptions come from?
- Which energy constraints are operational versus contractual?
- What would make a placement recommendation conflict with site operations?
- Which signals are safe to share for a pilot?
- What evidence would show that the diagnostic reflects real operating limits?
