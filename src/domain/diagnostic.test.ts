import { describe, expect, it } from 'vitest';
import * as reportModule from './report';
import { buildRetrospectiveReport } from './report';
import type { Assumptions, Policy, Region, Workload } from './types';

const assumptions: Assumptions = {
  gpu_kwh_assumption: 1,
  gpu_kwh_assumption_source: 'user',
  default_pue: 1.2
};

const policy: Policy = {
  max_delay_minutes: 120,
  allowed_regions: ['us-east-1', 'us-west-2', 'us-central-1'],
  blocked_regions: ['eu-west-1'],
  carbon_ceiling_g_per_kwh: 500,
  max_latency_ms: 90,
  require_manual_for_low_confidence: true
};

const completeRegions: Region[] = [
  {
    region: 'us-east-1',
    electricity_price_per_kwh: 0.3,
    carbon_intensity_g_per_kwh: 600,
    gpu_available: 32,
    grid_stress: 'medium',
    pue: 1.1,
    avg_latency_ms: 20,
    reliability_score: 0.98
  },
  {
    region: 'us-west-2',
    electricity_price_per_kwh: 0.1,
    carbon_intensity_g_per_kwh: 100,
    gpu_available: 32,
    grid_stress: 'low',
    pue: 1.05,
    avg_latency_ms: 40,
    reliability_score: 0.97
  },
  {
    region: 'us-central-1',
    electricity_price_per_kwh: 0.12,
    carbon_intensity_g_per_kwh: 140,
    gpu_available: 16,
    grid_stress: 'low',
    pue: 1.08,
    avg_latency_ms: 35,
    reliability_score: 0.96
  }
];

function workload(overrides: Partial<Workload> = {}): Workload {
  return {
    id: 'job-1',
    customer_id: 'customer-a',
    workload_type: 'embedding_batch',
    gpu_type: 'h100',
    gpu_count: 4,
    expected_duration_minutes: 120,
    deadline_minutes_from_now: 480,
    current_region: 'us-east-1',
    allowed_regions: ['us-east-1', 'us-west-2', 'us-central-1'],
    priority: 'normal',
    latency_sensitive: false,
    max_latency_ms: undefined,
    can_delay: true,
    can_move: true,
    checkpointable: true,
    estimated_revenue_usd: 200,
    ...overrides
  };
}

describe('diagnostic data quality', () => {
  it('returns a high score with complete data', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'complete-1' }), workload({ id: 'complete-2', workload_type: 'eval' })],
      regions: completeRegions,
      policy,
      assumptions
    });

    expect(report.data_quality.score).toBe('high');
    expect(report.data_quality.numeric_score).toBeGreaterThanOrEqual(80);
    expect(report.data_quality.reasons).toContain('Uploaded data is strong enough for a focused pilot discussion.');
  });

  it('returns a medium score with missing optional workload and region fields', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({
          id: 'missing-optional',
          deadline_minutes_from_now: undefined,
          allowed_regions: undefined,
          estimated_revenue_usd: undefined
        })
      ],
      regions: completeRegions.map(({ pue, reliability_score, ...region }) => region),
      policy: { ...policy, blocked_regions: [], carbon_ceiling_g_per_kwh: null },
      assumptions
    });

    expect(report.data_quality.score).toBe('medium');
    expect(report.data_quality.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('workloads are missing deadlines'),
        expect.stringContaining('workloads are missing allowed_regions')
      ])
    );
    expect(report.data_quality.warnings).toEqual(
      expect.arrayContaining([
        'PUE default was used for 3 regions.',
        'Reliability score missing for all regions.'
      ])
    );
  });

  it('returns a low score with many invalid or missing fields', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({ id: 'bad-current', current_region: 'missing-region', deadline_minutes_from_now: undefined }),
        workload({ id: 'no-flex', allowed_regions: undefined, estimated_revenue_usd: undefined })
      ],
      regions: completeRegions.map(({ pue, avg_latency_ms, reliability_score, ...region }) => region),
      policy: {
        ...policy,
        allowed_regions: [],
        blocked_regions: [],
        carbon_ceiling_g_per_kwh: null,
        max_latency_ms: null
      },
      assumptions,
      invalid_rows: [
        { file: 'workloads', row: 7, id: 'bad-row-1', reason: 'gpu_count must be >= 1' },
        { file: 'workloads', row: 8, id: 'bad-row-2', reason: 'priority must be one of low, normal, high, critical' }
      ],
      validation_errors: [
        {
          file: 'workloads',
          row: 2,
          field: 'current_region',
          message: 'Workload bad-current references missing current_region missing-region'
        }
      ]
    });

    expect(report.data_quality.score).toBe('low');
    expect(report.data_quality.numeric_score).toBeLessThan(50);
    expect(report.data_quality.reasons).toEqual(
      expect.arrayContaining([
        '50% of uploaded workload rows are invalid.',
        '1 workload references regions missing from region data.'
      ])
    );
    expect(report.data_quality.warnings).toEqual(expect.arrayContaining(['Latency data missing for all regions.']));
  });
});

describe('diagnostic savings range', () => {
  it('adds low expected and high estimated savings range values', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'range-1' })],
      regions: completeRegions,
      policy,
      assumptions
    });

    expect(report.savings_range.expected_usd).toBe(report.summary.estimated_savings_usd);
    expect(report.savings_range.low_usd).toBe(report.summary.estimated_savings_usd * 0.5);
    expect(report.savings_range.high_usd).toBe(report.summary.estimated_savings_usd * 1.25);
    expect(report.savings_range.note).toContain('rough planning range');
  });

  it('clamps negative savings range values to zero', () => {
    const range = (reportModule as any).buildSavingsRange(-10);

    expect(range).toEqual(
      expect.objectContaining({
        low_usd: 0,
        expected_usd: 0,
        high_usd: 0
      })
    );
  });
});

describe('diagnostic pilot recommendation', () => {
  it('picks a high-savings movable workload type and avoids critical workloads', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({ id: 'embedding-1', workload_type: 'embedding_batch', gpu_count: 8 }),
        workload({ id: 'embedding-2', workload_type: 'embedding_batch', gpu_count: 4 }),
        workload({ id: 'critical-1', workload_type: 'online_inference', priority: 'critical', gpu_count: 8 })
      ],
      regions: completeRegions,
      policy,
      assumptions
    });

    expect(report.pilot_recommendation.recommended).toBe(true);
    expect(report.pilot_recommendation.recommended_workload_types).toEqual(['embedding_batch']);
    expect(report.pilot_recommendation.excluded_priority_levels).toContain('critical');
    expect(report.pilot_recommendation.suggested_success_metric).toContain('estimated cost reduction');
    expect(report.pilot_recommendation.risks_to_watch).toEqual(expect.arrayContaining(['Validate against actual billing.']));
  });

  it('avoids latency-sensitive workloads when risky', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({
          id: 'latency-risk',
          workload_type: 'online_inference',
          latency_sensitive: true,
          max_latency_ms: 25,
          priority: 'normal'
        }),
        workload({ id: 'batch-safe', workload_type: 'eval', gpu_count: 4 })
      ],
      regions: completeRegions,
      policy,
      assumptions
    });

    expect(report.pilot_recommendation.recommended_workload_types).toEqual(['eval']);
    expect(report.pilot_recommendation.excluded_workload_types).toContain('online_inference');
  });

  it('returns no pilot recommendation when data quality is too weak', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'weak', deadline_minutes_from_now: undefined, allowed_regions: undefined })],
      regions: completeRegions.map(({ pue, avg_latency_ms, reliability_score, ...region }) => region),
      policy: { ...policy, allowed_regions: [], blocked_regions: [], carbon_ceiling_g_per_kwh: null, max_latency_ms: null },
      assumptions,
      invalid_rows: [
        { file: 'workloads', row: 4, id: 'bad-1', reason: 'gpu_count must be >= 1' },
        { file: 'workloads', row: 5, id: 'bad-2', reason: 'can_move must be true or false' }
      ]
    });

    expect(report.pilot_recommendation.recommended).toBe(false);
    expect(report.pilot_recommendation.reason).toContain('Data quality is low');
  });
});

describe('diagnostic exports', () => {
  it('adds diagnostic fields to JSON report output', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'json-1' })],
      regions: completeRegions,
      policy,
      assumptions
    });
    const json = JSON.parse(JSON.stringify(report));

    expect(json.diagnostic.executive_summary).toContain('Based on uploaded data');
    expect(json.data_quality).toBeDefined();
    expect(json.savings_range).toBeDefined();
    expect(json.pilot_recommendation).toBeDefined();
    expect(json.not_counted_savings.length).toBeGreaterThan(0);
  });

  it('renders customer-facing diagnostic Markdown', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'markdown-1' })],
      regions: completeRegions,
      policy,
      assumptions
    });
    const markdown = (reportModule as any).diagnosticReportToMarkdown(report);

    expect(markdown).toContain('# Blackout Markets Diagnostic Report');
    expect(markdown).toContain('## Executive Summary');
    expect(markdown).toContain('## Data Quality');
    expect(markdown).toContain('## Assumptions');
    expect(markdown).toContain('## What This Report Does Not Claim');
    expect(markdown).toContain('not counted because forecast data was not provided');
    expect(markdown).not.toContain('shadow mode for 2 weeks in shadow mode');
  });
});
