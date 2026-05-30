import type { Recommendation, WorkloadReportRow } from './types';

export { buildRetrospectiveReport } from './retrospective';

const recommendationFields: Array<keyof Recommendation> = [
  'workload_id',
  'recommendation',
  'current_region',
  'recommended_region',
  'delay_minutes',
  'baseline_cost_usd',
  'recommended_cost_usd',
  'estimated_savings_usd',
  'baseline_carbon_g',
  'recommended_carbon_g',
  'carbon_delta_g',
  'delay_impact',
  'policy_reason',
  'confidence',
  'reason',
  'valid',
  'priority'
];

const workloadReportFields: Array<keyof WorkloadReportRow> = [
  'id',
  'customer_id',
  'workload_type',
  'gpu_type',
  'gpu_count',
  'expected_duration_minutes',
  'expected_duration_hours',
  'current_region',
  'recommended_region',
  'recommendation_type',
  'baseline_cost_usd',
  'recommended_cost_usd',
  'hard_savings_usd',
  'baseline_carbon_g',
  'recommended_carbon_g',
  'carbon_delta_g',
  'confidence',
  'reason',
  'blocked_reasons',
  'counted_in_savings',
  'valid',
  'priority'
];

function escapeCsv(value: unknown) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function recommendationsToCsv(rows: Recommendation[]) {
  const header = recommendationFields.join(',');
  const body = rows.map((row) => recommendationFields.map((field) => escapeCsv(row[field])).join(','));
  return [header, ...body].join('\n');
}

export function workloadReportRowsToCsv(rows: WorkloadReportRow[]) {
  const header = workloadReportFields.join(',');
  const body = rows.map((row) => workloadReportFields.map((field) => escapeCsv(row[field])).join(','));
  return [header, ...body].join('\n');
}
