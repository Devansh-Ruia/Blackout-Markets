import { describe, expect, it } from 'vitest';
import { recommendationsToCsv } from './report';
import type { Recommendation } from './types';

describe('report export', () => {
  it('includes recommendation reasons in CSV export', () => {
    const rows: Recommendation[] = [
      {
        workload_id: 'job-1',
        recommendation: 'move_region',
        current_region: 'us-east-1',
        recommended_region: 'us-west-2',
        delay_minutes: 0,
        baseline_cost_usd: 1,
        recommended_cost_usd: 0.5,
        estimated_savings_usd: 0.5,
        baseline_carbon_g: 1000,
        recommended_carbon_g: 500,
        carbon_delta_g: -500,
        delay_impact: 'No delay',
        policy_reason: 'Allowed by policy',
        confidence: 'high',
        reason: 'Move to us-west-2 for lower cost and carbon.',
        valid: true,
        priority: 'normal'
      }
    ];

    const csv = recommendationsToCsv(rows);

    expect(csv).toContain('reason');
    expect(csv).toContain('Move to us-west-2 for lower cost and carbon.');
  });
});
