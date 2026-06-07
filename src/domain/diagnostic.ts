import type {
  BuildRetrospectiveReportInput,
  DataQuality,
  DiagnosticReport,
  NotCountedItem,
  PilotRecommendation,
  Policy,
  Priority,
  RetrospectiveReport,
  SavingsRange,
  WorkloadReportRow
} from './types.js';

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function pct(count: number, total: number) {
  if (total === 0) return 0;
  return round((count / total) * 100, 1);
}

function pctText(count: number, total: number) {
  const value = pct(count, total);
  return `${Number.isInteger(value) ? value.toFixed(0) : value}%`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function money(value: number) {
  return `$${round(value, 2).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildSavingsRange(value: number): SavingsRange {
  const expected = Math.max(0, round(value));
  return {
    low_usd: Math.max(0, round(expected * 0.5)),
    expected_usd: expected,
    high_usd: Math.max(0, round(expected * 1.25)),
    note: 'rough planning range, not billing truth. Validate against actual billing before using it for commitments.'
  };
}

export function notCountedSavings(): NotCountedItem[] {
  return [
    {
      item: 'Delay savings',
      reason: 'Delay savings are not counted because forecast data was not provided.'
    },
    {
      item: 'Demand response revenue',
      reason: 'Demand response revenue is not counted because no utility or market program data was uploaded.'
    },
    {
      item: 'Utility bill reconciliation',
      reason: 'Utility bill reconciliation is not included.'
    },
    {
      item: 'Live cloud inventory',
      reason: 'Live cloud inventory is not included.'
    },
    {
      item: 'Capacity reservation',
      reason: 'Capacity is batch-local in this report, not a real reservation system.'
    },
    {
      item: 'Customer contract pricing',
      reason: 'Customer contract pricing is not included unless reflected in uploaded energy prices.'
    },
    {
      item: 'Cooling estimates',
      reason: 'Cooling estimates use uploaded PUE or the default PUE assumption.'
    }
  ];
}

export function assessDataQuality(input: BuildRetrospectiveReportInput): DataQuality {
  const workloads = input.workloads;
  const regions = input.regions;
  const invalidRows = input.invalid_rows ?? [];
  const validationErrors = input.validation_errors ?? [];
  const totalRows = workloads.length + invalidRows.length;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (totalRows === 0) {
    score -= 45;
    reasons.push('No workload rows were uploaded.');
  }

  const missingDeadlines = workloads.filter((workload) => workload.deadline_minutes_from_now === undefined).length;
  if (missingDeadlines > 0) {
    score -= Math.min(12, Math.ceil(pct(missingDeadlines, workloads.length) * 0.12));
    reasons.push(`${pctText(missingDeadlines, workloads.length)} of workloads are missing deadlines.`);
  }

  const missingAllowed = workloads.filter((workload) => !workload.allowed_regions?.length).length;
  if (missingAllowed > 0) {
    score -= Math.min(8, Math.ceil(pct(missingAllowed, workloads.length) * 0.08));
    reasons.push(`${pctText(missingAllowed, workloads.length)} of workloads are missing allowed_regions.`);
  }

  if (invalidRows.length > 0) {
    score -= Math.min(40, Math.ceil(pct(invalidRows.length, totalRows) * 0.8));
    reasons.push(`${pctText(invalidRows.length, totalRows)} of uploaded workload rows are invalid.`);
  }

  const unknownRegionErrors = validationErrors.filter(
    (error) =>
      error.file === 'workloads' &&
      (error.field === 'current_region' ||
        error.field === 'allowed_regions' ||
        error.field === 'data_residency_region' ||
        error.message.includes('missing'))
  );
  if (unknownRegionErrors.length > 0) {
    score -= Math.min(25, unknownRegionErrors.length * 8);
    reasons.push(`${unknownRegionErrors.length} workload references regions missing from region data.`);
  }

  const pueDefaultCount = regions.filter((region) => region.pue === undefined).length;
  if (pueDefaultCount > 0) {
    score -= Math.min(6, pueDefaultCount * 2);
    warnings.push(`PUE default was used for ${plural(pueDefaultCount, 'region')}.`);
  }

  const missingLatency = regions.filter((region) => region.avg_latency_ms === undefined).length;
  if (missingLatency > 0) {
    score -= Math.min(9, missingLatency * 3);
    warnings.push(
      missingLatency === regions.length
        ? 'Latency data missing for all regions.'
        : `Latency data missing for ${plural(missingLatency, 'region')}.`
    );
  }

  const missingReliability = regions.filter((region) => region.reliability_score === undefined).length;
  if (missingReliability > 0) {
    score -= Math.min(6, missingReliability * 2);
    warnings.push(
      missingReliability === regions.length
        ? 'Reliability score missing for all regions.'
        : `Reliability score missing for ${plural(missingReliability, 'region')}.`
    );
  }

  const missingRevenue = workloads.filter((workload) => workload.estimated_revenue_usd === undefined).length;
  if (missingRevenue > 0) {
    score -= Math.min(3, Math.ceil(pct(missingRevenue, workloads.length) * 0.03));
    warnings.push(`${pctText(missingRevenue, workloads.length)} of workloads are missing estimated_revenue_usd.`);
  }

  if (input.policy.allowed_regions.length === 0) {
    // Advisory only -- blank allowed_regions is the recommended default, not a data gap, so it
    // carries no score penalty.
    warnings.push(
      'Allowed regions left blank (recommended default): every uploaded region is eligible unless another rule blocks it. This is intentional and safe, not a data problem.'
    );
  }

  if (input.policy.blocked_regions.length === 0) {
    score -= 2;
    warnings.push('No blocked regions configured.');
  }

  if (input.policy.carbon_ceiling_g_per_kwh === null) {
    score -= 3;
    warnings.push('Carbon ceiling is missing.');
  }

  if (input.policy.max_latency_ms === null) {
    score -= 3;
    warnings.push('Max latency policy is missing.');
  }

  const numeric = Math.round(clamp(score));
  if (reasons.length === 0) {
    reasons.push('Uploaded data is strong enough for a focused pilot discussion.');
  }

  return {
    score: numeric >= 80 ? 'high' : numeric >= 50 ? 'medium' : 'low',
    numeric_score: numeric,
    reasons,
    warnings
  };
}

function policyConstraints(policy: Policy) {
  return [
    `Max delay: ${policy.max_delay_minutes} minutes.`,
    policy.allowed_regions.length > 0
      ? `Allowed regions: ${policy.allowed_regions.join(', ')}.`
      : 'Allowed regions: all uploaded regions unless another rule blocks them.',
    policy.blocked_regions.length > 0 ? `Blocked regions: ${policy.blocked_regions.join(', ')}.` : 'Blocked regions: none.',
    policy.carbon_ceiling_g_per_kwh === null
      ? 'Carbon ceiling: not set.'
      : `Carbon ceiling: ${policy.carbon_ceiling_g_per_kwh} g/kWh.`,
    policy.max_latency_ms === null ? 'Max latency: not set.' : `Max latency: ${policy.max_latency_ms} ms.`,
    policy.require_manual_for_low_confidence
      ? 'Low-confidence moves require manual review.'
      : 'Low-confidence moves do not require manual review by policy.'
  ];
}

function assumptionsUsed(report: { assumptions: RetrospectiveReport['assumptions'] }) {
  return [
    `GPU energy assumption: ${report.assumptions.gpu_kwh_assumption} kWh per GPU-hour (${report.assumptions.gpu_kwh_assumption_source}).`,
    `Default PUE: ${report.assumptions.default_pue}; uploaded region PUE is used when present.`,
    report.assumptions.cost_formula,
    report.assumptions.carbon_formula,
    report.assumptions.delay_savings_rule
  ];
}

function topPinnedTypes(rows: WorkloadReportRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.recommendation_type !== 'pinned' || !row.workload_type) continue;
    counts.set(row.workload_type, (counts.get(row.workload_type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([workload_type, count]) => ({ workload_type, count }))
    .sort((a, b) => b.count - a.count || a.workload_type.localeCompare(b.workload_type))
    .slice(0, 5);
}

type DiagnosticReportInput = Omit<RetrospectiveReport, 'pilot_recommendation' | 'diagnostic'> & {
  pilot_recommendation?: PilotRecommendation;
  diagnostic?: DiagnosticReport;
};

export function recommendPilot(report: DiagnosticReportInput, dataQuality: DataQuality): PilotRecommendation {
  const excludedPriorityLevels: Priority[] = ['critical'];
  const risks = ['Validate against actual billing.', 'Watch SLA and latency impact.'];

  if (report.summary.capacity_blocked_count > 0) {
    risks.push('Capacity reservation is batch-local, not live inventory.');
  }

  if (dataQuality.score !== 'high') {
    risks.push('Improve data quality before production decisions.');
  }

  if (dataQuality.score === 'low') {
    return {
      recommended: false,
      recommended_workload_types: [],
      recommended_regions: [],
      excluded_workload_types: [],
      excluded_priority_levels: excludedPriorityLevels,
      suggested_pilot_duration: 'No pilot yet',
      suggested_success_metric: 'Raise data quality to medium or high and rerun the report.',
      reason: 'Data quality is low. Run another shadow analysis after fixing the warnings.',
      risks_to_watch: risks
    };
  }

  const excludedTypes = new Set<string>();
  const eligible = report.rows.filter((row) => {
    if (!row.valid || row.recommendation_type !== 'move_region' || !row.counted_in_savings) return false;
    if (row.priority === 'critical') {
      excludedTypes.add(row.workload_type);
      return false;
    }
    if (row.latency_sensitive) {
      excludedTypes.add(row.workload_type);
      return false;
    }
    if (row.confidence === 'low') return false;
    return true;
  });

  for (const row of report.rows) {
    if (row.priority === 'critical' || row.latency_sensitive || row.recommendation_type !== 'move_region') {
      if (row.workload_type) excludedTypes.add(row.workload_type);
    }
  }

  if (eligible.length === 0) {
    return {
      recommended: false,
      recommended_workload_types: [],
      recommended_regions: [],
      excluded_workload_types: [...excludedTypes].sort(),
      excluded_priority_levels: excludedPriorityLevels,
      suggested_pilot_duration: 'No pilot yet',
      suggested_success_metric: 'Find at least one non-critical movable workload type with medium or high confidence.',
      reason: 'No safe non-critical movable workload type had counted savings.',
      risks_to_watch: risks
    };
  }

  const byType = new Map<string, { savings: number; count: number }>();
  const regionCounts = new Map<string, { count: number; savings: number }>();
  for (const row of eligible) {
    const type = byType.get(row.workload_type) ?? { savings: 0, count: 0 };
    type.savings += row.estimated_savings_usd;
    type.count += 1;
    byType.set(row.workload_type, type);

    if (row.recommended_region) {
      const region = regionCounts.get(row.recommended_region) ?? { count: 0, savings: 0 };
      region.count += 1;
      region.savings += row.estimated_savings_usd;
      regionCounts.set(row.recommended_region, region);
    }
  }

  const selectedType = [...byType.entries()].sort(
    (a, b) => b[1].savings - a[1].savings || b[1].count - a[1].count || a[0].localeCompare(b[0])
  )[0][0];
  const selectedRows = eligible.filter((row) => row.workload_type === selectedType);
  const selectedRegions = [...new Set(selectedRows.map((row) => row.recommended_region).filter((region): region is string => Boolean(region)))]
    .sort((a, b) => {
      const aStats = regionCounts.get(a) ?? { count: 0, savings: 0 };
      const bStats = regionCounts.get(b) ?? { count: 0, savings: 0 };
      return bStats.count - aStats.count || bStats.savings - aStats.savings || a.localeCompare(b);
    })
    .slice(0, 3);
  const metric = Math.max(5, Math.min(15, Math.round(report.summary.estimated_savings_percent || 8)));

  return {
    recommended: true,
    recommended_workload_types: [selectedType],
    recommended_regions: selectedRegions,
    excluded_workload_types: [...excludedTypes].filter((type) => type !== selectedType).sort(),
    excluded_priority_levels: excludedPriorityLevels,
    suggested_pilot_duration: '2 weeks in shadow mode',
    suggested_success_metric: `${metric}% estimated cost reduction on movable workloads with no SLA impact.`,
    reason: `${selectedType} has the strongest counted savings among non-critical, non-latency-sensitive movable workloads.`,
    risks_to_watch: risks
  };
}

export function buildDiagnosticReport(
  report: DiagnosticReportInput & { pilot_recommendation: PilotRecommendation },
  dataQuality: DataQuality
): DiagnosticReport {
  const savingsRange = report.savings_range;
  const notCounted = report.not_counted_savings;
  const pilot = report.pilot_recommendation;
  const topMovable = report.breakdowns.savings_by_workload_type.filter((row) => row.hard_savings_usd > 0).slice(0, 5);
  const pinnedTypes = topPinnedTypes(report.rows);

  return {
    generated_at: report.generated_at,
    executive_summary: `Based on uploaded data, Blackout found ${report.summary.move_region_count} move recommendations and ${money(
      savingsRange.expected_usd
    )} in expected estimated savings. This requires validation against actual billing.`,
    workload_flexibility_summary: `${round(report.summary.movable_percent, 1)}% of valid workloads appear movable. ${round(
      report.summary.pinned_percent,
      1
    )}% are pinned by workload or residency constraints.`,
    estimated_savings_range: savingsRange,
    estimated_carbon_impact: `${round(report.summary.carbon_delta_g, 2).toLocaleString()} g estimated carbon delta based on uploaded region data.`,
    top_blockers: report.breakdowns.top_could_not_move_reasons.slice(0, 5),
    top_movable_workload_types: topMovable,
    top_pinned_workload_types: pinnedTypes,
    top_opportunities: report.breakdowns.top_savings_opportunities.slice(0, 5),
    policy_constraints_applied: policyConstraints(report.raw_policy),
    assumptions_used: assumptionsUsed(report),
    data_quality: dataQuality,
    not_counted_savings: notCounted,
    recommended_pilot_scope: pilot,
    recommended_next_step: pilot.recommended
      ? `Start with ${pilot.recommended_workload_types.join(', ')} in ${pilot.recommended_regions.join(', ')} for ${pilot.suggested_pilot_duration}.`
      : pilot.reason
  };
}

function bulletList(items: string[]) {
  if (items.length === 0) return '- None.';
  return items.map((item) => `- ${item}`).join('\n');
}

function blockerList(items: Array<{ reason: string; count: number }>) {
  if (items.length === 0) return '- No major blockers found.';
  return items.map((item) => `- ${item.reason} (${item.count})`).join('\n');
}

function workloadTypeSavings(rows: RetrospectiveReport['breakdowns']['savings_by_workload_type']) {
  if (rows.length === 0) return '- No counted movable savings by workload type.';
  return rows
    .slice(0, 5)
    .map((row) => `- ${row.key}: ${money(row.hard_savings_usd)} estimated savings across ${plural(row.workload_count, 'workload')}.`)
    .join('\n');
}

export function diagnosticReportToMarkdown(report: RetrospectiveReport) {
  const diagnostic = report.diagnostic;
  const pilot = report.pilot_recommendation;
  const pilotText = pilot.recommended
    ? [
        `Start with ${pilot.recommended_workload_types.join(', ')} workloads in ${pilot.recommended_regions.join(', ')}.`,
        `Run for ${pilot.suggested_pilot_duration}.`,
        `Success metric: ${pilot.suggested_success_metric}`,
        `Reason: ${pilot.reason}`,
        `Do not include priority levels: ${pilot.excluded_priority_levels.join(', ')}.`,
        pilot.excluded_workload_types.length > 0 ? `Exclude workload types for now: ${pilot.excluded_workload_types.join(', ')}.` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
    : `No pilot recommended yet. ${pilot.reason}`;

  return `# Blackout Markets Diagnostic Report

Generated: ${report.generated_at}

## Executive Summary

${diagnostic.executive_summary}

Shadow mode only. No jobs are moved.

## Workload Flexibility

${diagnostic.workload_flexibility_summary}

Top movable workload types:

${workloadTypeSavings(diagnostic.top_movable_workload_types)}

Top pinned workload types:

${diagnostic.top_pinned_workload_types.length === 0 ? '- No pinned workload types found.' : diagnostic.top_pinned_workload_types.map((item) => `- ${item.workload_type}: ${item.count}`).join('\n')}

## Estimated Savings

- Low estimate: ${money(report.savings_range.low_usd)}
- Expected estimate: ${money(report.savings_range.expected_usd)}
- High estimate: ${money(report.savings_range.high_usd)}

This is a ${report.savings_range.note}

Estimated carbon impact: ${diagnostic.estimated_carbon_impact}

## Data Quality

Data quality: ${report.data_quality.score} (${report.data_quality.numeric_score}/100)

Reasons:

${bulletList(report.data_quality.reasons)}

Warnings:

${bulletList(report.data_quality.warnings)}

## Top Blockers

${blockerList(diagnostic.top_blockers)}

## Best Pilot Candidate

${pilotText}

Risks to watch:

${bulletList(pilot.risks_to_watch)}

## Assumptions

${bulletList(diagnostic.assumptions_used)}

Policy constraints applied:

${bulletList(diagnostic.policy_constraints_applied)}

## What This Report Does Not Claim

${diagnostic.not_counted_savings.map((item) => `- ${item.item}: ${item.reason}`).join('\n')}

## Recommended Next Step

${diagnostic.recommended_next_step}
`;
}
