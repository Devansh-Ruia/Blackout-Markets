# Sample Outputs

Run `npm run demo:reports` to regenerate these files from the fixture datasets.

## Normal Week

Scenario: mixed workload types, moderate price differences, and a few pinned workloads.

Demonstrates: the basic diagnostic flow, two move recommendations, one pinned workload, high data quality, and a small positive savings estimate.

Current generated summary: 4 valid workloads, 2 move recommendations, 1 pinned workload, $2.05 expected estimated savings, high data quality.

- Diagnostic: [../reports/demo/normal-week/diagnostic.md](../reports/demo/normal-week/diagnostic.md)
- Recommendations CSV: [../reports/demo/normal-week/recommendations.csv](../reports/demo/normal-week/recommendations.csv)
- Full JSON: [../reports/demo/normal-week/report.json](../reports/demo/normal-week/report.json)

## Grid Stress Week

Scenario: one region has higher electricity price, carbon intensity, and grid stress.

Demonstrates: movement recommendations during stressed conditions, manual review, pinned workloads, and capacity-sensitive recommendations.

Current generated summary: 5 valid workloads, 2 move recommendations, 1 manual-review workload, 1 pinned workload, $8.33 expected estimated savings, high data quality.

- Diagnostic: [../reports/demo/grid-stress-week/diagnostic.md](../reports/demo/grid-stress-week/diagnostic.md)
- Recommendations CSV: [../reports/demo/grid-stress-week/recommendations.csv](../reports/demo/grid-stress-week/recommendations.csv)
- Full JSON: [../reports/demo/grid-stress-week/report.json](../reports/demo/grid-stress-week/report.json)

## Policy Heavy Week

Scenario: blocked regions, data residency, latency-sensitive jobs, critical priority, and a carbon ceiling.

Demonstrates: policy constraints, manual review, pinned workloads, and a narrow safe pilot candidate.

Current generated summary: 5 valid workloads, 1 move recommendation, 2 manual-review workloads, 1 pinned workload, $1.25 expected estimated savings, high data quality.

- Diagnostic: [../reports/demo/policy-heavy-week/diagnostic.md](../reports/demo/policy-heavy-week/diagnostic.md)
- Recommendations CSV: [../reports/demo/policy-heavy-week/recommendations.csv](../reports/demo/policy-heavy-week/recommendations.csv)
- Full JSON: [../reports/demo/policy-heavy-week/report.json](../reports/demo/policy-heavy-week/report.json)
