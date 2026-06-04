# Blackout Markets PRD

Version: v0.3 Diagnostic
Date: 2026-06-02
Status: Validation-ready MVP
Owner: Founding team

## 1. Product Summary

Blackout Markets is a retrospective shadow optimizer for GPU infrastructure teams.

It takes historical AI workload logs, region energy data, GPU capacity data, and policy constraints, then shows what Blackout would have recommended: run now, delay, move region, manual review, pinned, or invalid.

The product does not move jobs in production. It helps infrastructure teams understand which workloads are flexible, what savings might be possible, what policy constraints block movement, and what a safe pilot should test first.

The first customer is an independent GPU cloud operator or AI infrastructure provider with multi-region workloads and direct exposure to GPU utilization, energy cost, latency, and customer SLA pressure.

## 2. Product Objective

The current objective is to help founders and design partners answer one question:

> Based on last week's workload logs, what could Blackout have safely recommended, how much might it have saved, how trustworthy is the data, and what should we pilot first?

The product should be useful before any production integration exists.

## 3. Background and Context

AI workloads are becoming more movable, but the conditions under them change constantly:

- electricity cost
- carbon intensity
- grid stress
- GPU availability
- cooling overhead
- latency
- reliability
- data residency
- customer priority
- workload deadlines

Most AI infrastructure systems still schedule jobs using static or narrow signals. Finance, infrastructure, energy, sustainability, and data center teams often make decisions separately. This creates waste, margin risk, and poor visibility into which workloads are actually flexible.

Blackout Markets starts as a shadow analysis tool because production scheduling is too risky for an early product. Historical reports let customers test the logic without giving Blackout control over live systems.

## 4. Target Customer

### Beachhead Segment

Independent GPU cloud operators and AI infrastructure providers with:

- 1,000 to 50,000 GPUs
- at least two regions, clusters, or data center sites
- Kubernetes, Ray, Slurm, or custom scheduling
- batch, async inference, evaluation, embedding, or training workloads
- direct or indirect energy cost exposure
- pressure to improve GPU gross margin

### Why This Segment First

This segment has the best mix of urgency, budget, access, and ability to adopt early.

Hyperscalers have the budget but will likely build internally. Enterprises have budgets but often lack direct scheduling control or energy exposure. Colocation providers feel power constraints but usually cannot move tenant workloads. Sovereign AI projects are large but slow and political.

GPU cloud operators are close enough to both compute control and energy economics to act.

## 5. Personas

### Economic Buyer

Titles:

- CTO
- COO
- VP Infrastructure
- Head of GPU Cloud
- Head of Platform

Cares about:

- gross margin per GPU-hour
- utilization
- uptime
- capacity planning
- customer SLA risk
- energy cost variance
- proving infrastructure discipline to investors or the board

Fears:

- external tools breaking scheduling
- inaccurate savings claims
- customer-facing latency issues
- exposing sensitive workload metadata
- platform team rejection

Meeting trigger:

> Show us what last week's workload placement would have looked like under energy, capacity, carbon, and policy constraints.

### Daily User

Titles:

- ML platform engineer
- Infrastructure engineer
- Scheduler owner
- SRE
- Capacity planning engineer

Cares about:

- clear recommendations
- safe defaults
- deterministic behavior
- row-level validation errors
- no production impact
- explainable policy logic
- not getting paged

Fears:

- black-box optimization
- vague reports
- brittle CSV parsing
- hidden assumptions
- management using the tool to force unsafe cost cuts

Meeting trigger:

> Run it in shadow mode with exported logs. No cloud credentials. No jobs moved.

### Influencers

Finance or FinOps lead:

- cares about margin, cost allocation, cost variance, and customer profitability

Energy or data center operator:

- cares about grid stress, power limits, cooling, PUE, and demand flexibility

Sustainability lead:

- cares about carbon reporting, region-level emissions, and auditability

## 6. Jobs To Be Done

Primary job:

> Help me understand which AI workloads could safely run somewhere else, later, or not at all under real constraints.

Supporting jobs:

1. Show where GPU scheduling decisions create avoidable cost.
2. Identify workload classes that are movable, deferrable, pinned, or unsafe.
3. Estimate cost and carbon impact without claiming exact billing truth.
4. Make policy constraints explicit.
5. Reveal data quality gaps before production integration.
6. Recommend a safe first pilot scope.
7. Give infrastructure teams a report they can discuss with finance, energy, and leadership.

## 7. Current Product Scope

### Included

- Web app for uploading workload, region, and policy data
- Retrospective report generation
- Per-workload recommendations
- Batch capacity reservation
- Data validation and row-level errors
- Data quality score
- Estimated savings range
- Carbon impact estimate
- Pilot recommendation
- JSON export
- recommendations CSV export
- diagnostic Markdown export
- CLI report generation
- demo report generation from fixtures
- design-partner packet
- data templates
- release and deployment docs
- test coverage for core behavior

### Not Included

- live scheduling
- live migration
- cloud inventory integration
- Kubernetes controller
- Ray integration
- Slurm integration
- forecasting
- utility billing reconciliation
- energy procurement
- demand response revenue
- marketplace features
- auth
- billing
- database
- map UI
- enterprise admin controls

## 8. Core User Workflow

### Web Workflow

1. User uploads `workloads.csv`.
2. User uploads `regions.csv`.
3. User uploads or configures `policy.json`.
4. System validates inputs.
5. User fixes validation errors if needed.
6. User runs retrospective report.
7. System generates:
   - summary metrics
   - recommendation mix
   - estimated savings range
   - carbon impact
   - data quality score
   - top blockers
   - top opportunities
   - pilot recommendation
   - per-workload recommendation table
8. User filters results.
9. User exports JSON, CSV, or Markdown.

### CLI Workflow

User runs:

```bash
npm run report -- --workloads fixtures/normal-week/workloads.csv --regions fixtures/normal-week/regions.csv --policy fixtures/normal-week/policy.json --out reports/normal-week
```

System outputs:

- `report.json`
- `recommendations.csv`
- `diagnostic.md`

### Demo Report Workflow

User runs:

```bash
npm run demo:reports
```

System generates:

- `reports/demo/normal-week/`
- `reports/demo/grid-stress-week/`
- `reports/demo/policy-heavy-week/`

Each folder contains:

- `report.json`
- `recommendations.csv`
- `diagnostic.md`

## 9. Functional Requirements

### 9.1 Data Ingestion

The product must accept user-provided CSV and JSON files.

Required files:

- `workloads.csv`
- `regions.csv`
- `policy.json`

The system must not rely on hidden placeholder data in the production UI.

### 9.2 Workload Schema

Required workload fields:

- `id`: string, required
- `workload_type`: string, required
- `gpu_type`: string, required
- `gpu_count`: integer, required, greater than 0
- `expected_duration_minutes`: number, required, greater than 0
- `current_region`: string, required
- `priority`: `low`, `normal`, `high`, or `critical`
- `latency_sensitive`: boolean
- `can_delay`: boolean
- `can_move`: boolean
- `checkpointable`: boolean

Optional workload fields:

- `customer_id`: string
- `deadline_minutes_from_now`: number, greater than or equal to 0
- `allowed_regions`: pipe-separated string list in CSV
- `max_latency_ms`: number, greater than or equal to 0
- `data_residency_region`: string
- `estimated_revenue_usd`: number, greater than or equal to 0

### 9.3 Region Schema

Required region fields:

- `region`: string, required
- `electricity_price_per_kwh`: number, greater than or equal to 0
- `carbon_intensity_g_per_kwh`: number, greater than or equal to 0
- `gpu_available`: integer, greater than or equal to 0
- `grid_stress`: `low`, `medium`, or `high`

Optional region fields:

- `pue`: number, greater than or equal to 1
- `avg_latency_ms`: number, greater than or equal to 0
- `reliability_score`: number from 0 to 1

### 9.4 Policy Schema

Policy fields:

- `max_delay_minutes`: number
- `allowed_regions`: string array
- `blocked_regions`: string array
- `carbon_ceiling_g_per_kwh`: number or null
- `max_latency_ms`: number or null
- `require_manual_for_low_confidence`: boolean

### 9.5 Validation

The system must validate:

- missing required files
- empty files
- malformed CSV
- missing headers
- duplicate workload IDs
- negative numbers
- invalid enum values
- invalid boolean values
- invalid JSON policy
- workloads referencing unknown regions
- impossible policy combinations
- invalid allowed region parsing
- missing required workload fields
- missing required region fields

Validation errors must be clear and actionable. Row-level errors should be shown where possible.

The system must not crash on bad input.

### 9.6 Recommendation Types

Each workload must receive one recommendation:

- `run_now`
- `delay`
- `move_region`
- `manual_review`
- `pinned`
- `invalid`

Every recommendation must include:

- recommendation type
- recommended region if applicable
- confidence: `high`, `medium`, or `low`
- reason
- baseline cost
- recommended cost
- estimated savings
- baseline carbon
- recommended carbon
- carbon delta
- delay minutes if applicable
- validation errors if invalid

### 9.7 Hard Recommendation Rules

The optimizer must follow these rules:

1. Never recommend movement if `can_move` is false.
2. Never recommend delay if `can_delay` is false.
3. Never move outside workload-level allowed regions.
4. Never move into policy-level blocked regions.
5. Never move outside `data_residency_region` if set.
6. Never move to a region with insufficient remaining GPU capacity.
7. Never delay past deadline.
8. Never move latency-sensitive workloads to regions above latency limits.
9. Critical workloads should default to `run_now` or `manual_review` unless there is a hard policy issue.
10. High grid stress should reduce confidence or trigger manual review.
11. Invalid or contradictory data should produce `invalid`, not a silent recommendation.

### 9.8 Batch Capacity Reservation

Capacity must be reserved across the batch.

Processing order:

1. critical priority
2. high priority
3. normal priority
4. low priority

Within the same priority, input order must remain stable.

When a workload is assigned to a region, the system must subtract its `gpu_count` from remaining capacity for that region.

The system must not recommend moving or running a workload in a region that no longer has enough remaining capacity.

This is a simple batch-local reservation model, not a real cluster reservation system.

### 9.9 Cost Estimate

Cost estimate formula:

```text
estimated_kwh = gpu_count * expected_duration_hours * gpu_kwh_assumption * pue
estimated_cost = estimated_kwh * electricity_price_per_kwh
```

Requirements:

- `gpu_kwh_assumption` must be visible in assumptions.
- PUE must be region-specific when provided.
- Default PUE usage must be reported.
- The product must label costs as estimates, not exact billing.

### 9.10 Carbon Estimate

Carbon estimate formula:

```text
estimated_carbon_g = estimated_kwh * carbon_intensity_g_per_kwh
```

Requirements:

- Carbon estimates must be based on uploaded region data.
- Missing or weak carbon data must affect data quality.
- The product must not claim formal carbon accounting.

### 9.11 Savings Range

The diagnostic must include a rough savings range.

Formula:

- expected = estimated savings
- low = expected * 0.5
- high = expected * 1.25

Values must be clamped at 0.

The UI and exports must label this as an estimated planning range, not billing truth.

### 9.12 Data Quality Score

The diagnostic must include:

- score: `high`, `medium`, or `low`
- numeric score from 0 to 100
- reasons
- warnings

The score should start at 100 and subtract points for weak or missing data.

Factors:

- percent of workloads missing deadline
- percent missing allowed regions
- invalid rows
- unknown regions
- region PUE defaults
- missing latency data
- missing reliability score
- missing revenue estimates
- empty or broad policy constraints
- missing carbon ceiling
- missing max latency

The UI should state the score without shaming the user.

Example:

```text
Data quality: Medium
Reason: 14% of workloads are missing deadlines. PUE default was used for 2 regions.
```

### 9.13 Pilot Recommendation

The diagnostic must generate a pilot recommendation when data is strong enough.

It should include:

- recommended workload types
- recommended regions
- excluded workload types
- excluded priority levels
- suggested pilot duration
- suggested success metric
- reason
- risks to watch

Rules:

- Prefer high-savings workload types.
- Prefer high-confidence recommendations.
- Avoid critical workloads.
- Avoid risky latency-sensitive workloads.
- Prefer regions with successful recommendations.
- Return no pilot recommendation if the data is too weak.

Example:

```text
Start with embedding_batch and eval workloads in us-east-1 and ca-central-1.
Do not include critical inference jobs yet.
Run in shadow mode for 2 weeks.
Success metric: 8% estimated cost reduction on movable workloads with no SLA impact.
```

### 9.14 Not Counted Items

The diagnostic must clearly state what is not counted.

Examples:

- delay savings are not counted without forecast data
- demand response revenue is not counted
- utility bill reconciliation is not included
- live cloud inventory is not included
- production job movement is not included
- capacity is batch-local
- customer contract pricing is not included unless uploaded
- cooling estimates rely on PUE assumptions

### 9.15 Exports

JSON export must include:

- generated timestamp
- raw policy
- assumptions
- region input summary
- workload input summary
- per-workload recommendations
- aggregate report summary
- diagnostic summary
- data quality
- savings range
- pilot recommendation
- not counted items
- validation errors

CSV export must include per-workload fields:

- `id`
- `workload_type`
- `priority`
- `current_region`
- `recommended_region`
- `recommendation`
- `confidence`
- `reason`
- `baseline_cost`
- `recommended_cost`
- `estimated_savings`
- `baseline_carbon`
- `recommended_carbon`
- `carbon_delta`
- `delay_minutes`
- `valid`
- `validation_errors`

Markdown diagnostic export must include:

- Executive Summary
- Workload Flexibility
- Estimated Savings
- Data Quality
- Top Blockers
- Best Pilot Candidate
- Assumptions
- What This Report Does Not Claim
- Recommended Next Step

## 10. UI Requirements

### 10.1 Global UI Copy

The app must clearly communicate:

- shadow mode only
- no jobs are moved
- historical logs are used
- estimates are not exact billing
- recommendations require review before production use

Approved copy examples:

- `Shadow mode only. No jobs are moved.`
- `Use historical logs to see what Blackout would have recommended.`
- `Estimated range, not billing truth.`
- `Review recommendations before production use.`
- `Export diagnostic`

Avoid:

- formal polite phrasing
- emojis
- marketing-heavy language
- phrases like `unlock`, `seamless`, `revolutionize`, or `transform`

### 10.2 Upload Screen

Must allow upload of:

- workload CSV
- region CSV
- policy JSON

Must show:

- selected file names
- validation errors
- missing file errors
- clear next action

### 10.3 Policy Screen

Must allow viewing or editing:

- max delay minutes
- allowed regions
- blocked regions
- carbon ceiling
- max latency
- low-confidence manual review setting

### 10.4 Report Screen

Must show:

- summary cards
- recommendation mix
- estimated savings range
- carbon impact
- data quality score
- top blockers
- top opportunities
- savings by workload type
- savings by current region
- savings by recommended region
- pilot recommendation
- not counted items
- assumptions
- per-workload table
- filters
- export buttons

### 10.5 Filters

Per-workload table must support filtering by:

- recommendation type
- priority
- current region
- recommended region
- validity
- confidence

## 11. API Requirements

### 11.1 Retrospective Report Endpoint

Endpoint:

```text
POST /api/report/retrospective
```

Input:

- workload data
- region data
- policy data
- assumptions if supported

Output:

- full retrospective report
- diagnostic summary
- validation errors

The endpoint must return clear non-500 errors for invalid input.

### 11.2 Export Endpoints

The server must support export of:

- recommendation CSV
- diagnostic Markdown
- JSON report

Exports must be generated from domain/report data, not duplicated UI-only logic.

## 12. CLI Requirements

### 12.1 Single Report Command

Command:

```bash
npm run report -- --workloads <path> --regions <path> --policy <path> --out <output-dir>
```

Must output:

- `report.json`
- `recommendations.csv`
- `diagnostic.md`

Requirements:

- validate input paths
- create output directory if missing
- fail nonzero on invalid input
- print clear errors
- not require web server
- reuse domain logic

### 12.2 Demo Report Command

Command:

```bash
npm run demo:reports
```

Must generate reports for:

- normal-week
- grid-stress-week
- policy-heavy-week

Output path:

```text
reports/demo/<fixture-name>/
```

Each output must include:

- `report.json`
- `recommendations.csv`
- `diagnostic.md`

## 13. Fixtures and Templates

### 13.1 Fixture Sets

The repo must include:

1. `normal-week`
   - mixed workload types
   - moderate prices
   - moderate savings
   - some pinned workloads

2. `grid-stress-week`
   - one region with high price, high carbon, and high grid stress
   - manual review and move recommendations
   - enough workloads to test capacity reservation

3. `policy-heavy-week`
   - blocked regions
   - data residency
   - latency-sensitive jobs
   - critical priority jobs
   - policy preventing unsafe moves

Each fixture must include:

- `workloads.csv`
- `regions.csv`
- `policy.json`
- `expected-notes.md`

### 13.2 Templates

The repo must include:

- `templates/workloads_template.csv`
- `templates/regions_template.csv`
- `templates/policy_template.json`
- `templates/customer_data_request.md`

Templates must match the actual parser and validator.

The data request must explain:

- required files
- required fields
- optional fields
- anonymization guidance
- what not to include
- how Blackout uses the data
- what the diagnostic does not do

## 14. Design-Partner Packet

The repo must include:

```text
design-partner/
```

Required files:

- `overview.md`
- `customer_data_request.md`
- `pilot_scope.md`
- `validation_questions.md`
- `sample_outputs.md`

### 14.1 Overview

Must explain:

- what Blackout does
- what it does not do
- who it is for
- what data it needs
- what the diagnostic produces
- what a design partner gets
- what a 2-week pilot looks like
- what success looks like

### 14.2 Customer Data Request

Must explain:

- files needed
- required fields
- optional fields
- anonymization guidance
- what not to include
- expected turnaround time
- security notes
- what the diagnostic does not claim

### 14.3 Pilot Scope

Must include:

- objective
- customer responsibilities
- Blackout responsibilities
- data needed
- timeline
- success metrics
- excluded scope
- risks to watch
- final deliverables

### 14.4 Validation Questions

Must include open-ended questions for:

- CTO or VP Infrastructure
- ML platform engineer
- scheduler owner
- FinOps or finance lead
- energy or data center operator

### 14.5 Sample Outputs

Must link to generated demo reports.

## 15. Security and Privacy Requirements

The product must not require:

- cloud credentials
- customer names
- model contents
- private prompts
- user data
- API keys
- secrets
- production scheduler access

Data guidance must state:

- `customer_id` can be hashed
- workload IDs can be randomized
- exact revenue can be omitted
- model names should be removed
- customer names should be removed
- region names should remain specific enough for analysis

The product should be deployable as a private demo.

Auth is out of scope for v0.3.

## 16. Success Metrics

### Product Success

The v0.3 product is successful if:

- a real infrastructure person understands the report without a founder explaining every field
- the product can run on real anonymized historical logs
- the report identifies movable or deferrable workload classes
- the report produces a believable pilot recommendation
- data quality gaps are clear
- customers trust the tool enough to share logs for a diagnostic

### Business Validation Success

The company is making progress if:

- 10 infrastructure interviews produce repeatable pain patterns
- at least 3 prospects ask for the data template
- at least 1 prospect agrees to run the diagnostic on historical logs
- at least 1 prospect discusses a paid pilot

### Technical Success

The product is technically credible if:

- tests pass
- build passes
- CLI works without server
- malformed inputs fail safely
- reports are deterministic
- capacity reservation works across batch
- exports match UI-visible results

## 17. Acceptance Criteria

The MVP is accepted when:

1. `npm test` passes.
2. `npm run build` passes.
3. `npm run demo:reports` generates all demo reports.
4. Web upload to report flow works with fixture data.
5. CLI report generation outputs JSON, CSV, and Markdown.
6. Invalid inputs show clear errors.
7. Per-workload recommendations include useful reasons.
8. Aggregate diagnostic includes data quality, savings range, pilot recommendation, assumptions, and not-counted items.
9. Design-partner packet exists and is usable in customer calls.
10. README links to web app instructions, CLI instructions, demo reports, templates, and design-partner packet.
11. No live scheduling, auth, billing, forecasting, marketplace, or cloud integration was added.

## 18. Roadmap

### v0.3 Diagnostic

Current version.

Goal:

- package the shadow optimizer for customer discovery and design-partner diagnostics

Key capabilities:

- retrospective reports
- diagnostic exports
- CLI
- fixtures
- design-partner packet
- templates
- test coverage

### v0.4 Design Partner Pilot

Goal:

- run on one real customer's anonymized historical logs

Potential additions:

- more flexible CSV mapping
- customer-specific assumptions file
- richer data quality checks
- sensitivity analysis for GPU kWh assumptions
- weekly report mode
- better report comparison across weeks

Still not included:

- live scheduling
- production automation

### v0.5 Shadow Continuous Mode

Goal:

- run repeatedly against customer exports or read-only log buckets

Potential additions:

- scheduled report generation
- trend reports
- workload class history
- recurring data quality checks
- private deployment hardening
- lightweight team access if needed

### v1.0 Guarded Automation

Goal:

- move from retrospective recommendations to limited production recommendation workflows

Potential additions:

- Kubernetes admission or scheduler plugin
- Ray job submission wrapper
- approval workflow
- rollback and audit log
- policy-as-code
- limited control for low-risk workload classes

Only build after a design partner proves that historical recommendations are useful.

## 19. Risks

### Market Risk

Customers may not feel enough energy-driven pain to buy.

Test:

- ask for specific examples of margin loss, power constraints, or scheduling incidents
- ask who owns the cost and who can act

### Technical Risk

Too few workloads may be movable or deferrable.

Test:

- run the diagnostic on real logs
- measure movable workload percentage

### Data Risk

Customers may not have region-level energy, latency, reliability, or capacity data.

Test:

- ask for actual export examples
- measure data quality score on real inputs

### GTM Risk

The buyer who benefits financially may not control workload placement.

Test:

- map buyer, user, finance owner, energy owner, and scheduler owner during discovery

### Trust Risk

Infrastructure teams may not trust a startup near scheduling decisions.

Test:

- keep shadow mode
- avoid cloud credentials
- produce explainable recommendations

### Accuracy Risk

Savings estimates may be challenged.

Mitigation:

- use ranges
- label assumptions
- avoid exact billing claims
- reconcile with actual bills only in later pilots

## 20. Open Questions

1. What percentage of real GPU workloads are movable or deferrable?
2. Do GPU cloud operators know their true energy cost by region?
3. Does finance care about workload-level margin or only cluster-level margin?
4. Which workload class is the safest first pilot candidate?
5. What data can customers actually export without a security review?
6. How often should the diagnostic run to be useful?
7. Will customers pay for diagnostics, or only for production automation?
8. Which integration comes first after validation: Kubernetes, Ray, or Slurm?
9. Do customers want this as a local CLI, private web app, or hosted service?
10. What report format gets forwarded internally?

## 21. Product Boundaries

The product must stay focused on customer validation.

Build now:

- better diagnostics
- better data quality checks
- better reports
- better templates
- better pilot scoping

Avoid now:

- live scheduling
- live migration
- marketplace logic
- forecasting
- utility integrations
- auth
- billing
- dashboards that look polished but do not improve trust

The next real milestone is not another feature. It is one real GPU infrastructure team running the diagnostic on historical logs.
