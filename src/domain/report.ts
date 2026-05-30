import type { Recommendation } from './types';

const exportFields: Array<keyof Recommendation> = [
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

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function recommendationsToCsv(rows: Recommendation[]) {
  const header = exportFields.join(',');
  const body = rows.map((row) => exportFields.map((field) => escapeCsv(row[field])).join(','));
  return [header, ...body].join('\n');
}
