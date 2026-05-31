import type { Recommendation, WorkloadReportRow } from './types';

export { buildRetrospectiveReport } from './retrospective';
export { buildSavingsRange, diagnosticReportToMarkdown } from './diagnostic';

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

const workloadReportFields: Array<{ header: string; value: (row: WorkloadReportRow) => unknown }> = [
  { header: 'id', value: (row) => row.id },
  { header: 'workload_type', value: (row) => row.workload_type },
  { header: 'priority', value: (row) => row.priority },
  { header: 'current_region', value: (row) => row.current_region },
  { header: 'recommended_region', value: (row) => row.recommended_region },
  { header: 'recommendation', value: (row) => row.recommendation },
  { header: 'confidence', value: (row) => row.confidence },
  { header: 'reason', value: (row) => row.reason },
  { header: 'baseline_cost', value: (row) => row.baseline_cost_usd },
  { header: 'recommended_cost', value: (row) => row.recommended_cost_usd },
  { header: 'estimated_savings', value: (row) => row.estimated_savings_usd },
  { header: 'baseline_carbon', value: (row) => row.baseline_carbon_g },
  { header: 'recommended_carbon', value: (row) => row.recommended_carbon_g },
  { header: 'carbon_delta', value: (row) => row.carbon_delta_g },
  { header: 'delay_minutes', value: (row) => row.delay_minutes },
  { header: 'valid', value: (row) => row.valid },
  { header: 'validation_errors', value: (row) => row.validation_errors }
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
  const header = workloadReportFields.map((field) => field.header).join(',');
  const body = rows.map((row) => workloadReportFields.map((field) => escapeCsv(field.value(row))).join(','));
  return [header, ...body].join('\n');
}
