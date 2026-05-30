import { describe, expect, it } from 'vitest';
import { buildRetrospectiveReport, workloadReportRowsToCsv } from './report';
import type { Assumptions, Policy, Region, Workload } from './types';

const assumptions: Assumptions = {
  gpu_kwh_assumption: 1,
  gpu_kwh_assumption_source: 'user'
};

const policy: Policy = {
  max_delay_minutes: 120,
  allowed_regions: [],
  blocked_regions: [],
  carbon_ceiling_g_per_kwh: null,
  max_latency_ms: null,
  require_manual_for_low_confidence: true
};

const regions: Region[] = [
  {
    region: 'us-east-1',
    electricity_price_per_kwh: 0.3,
    carbon_intensity_g_per_kwh: 600,
    gpu_available: 32,
    grid_stress: 'medium',
    pue: 1,
    avg_latency_ms: 20,
    reliability_score: 0.98
  },
  {
    region: 'us-west-2',
    electricity_price_per_kwh: 0.1,
    carbon_intensity_g_per_kwh: 100,
    gpu_available: 16,
    grid_stress: 'low',
    pue: 1,
    avg_latency_ms: 35,
    reliability_score: 0.97
  },
  {
    region: 'us-central-1',
    electricity_price_per_kwh: 0.12,
    carbon_intensity_g_per_kwh: 150,
    gpu_available: 16,
    grid_stress: 'low',
    pue: 1,
    avg_latency_ms: 45,
    reliability_score: 0.96
  }
];

function workload(overrides: Partial<Workload> = {}): Workload {
  return {
    id: 'job-1',
    customer_id: 'customer-a',
    workload_type: 'training',
    gpu_type: 'h100',
    gpu_count: 4,
    expected_duration_minutes: 60,
    deadline_minutes_from_now: 240,
    current_region: 'us-east-1',
    allowed_regions: ['us-east-1', 'us-west-2', 'us-central-1'],
    priority: 'normal',
    latency_sensitive: false,
    can_delay: true,
    can_move: true,
    checkpointable: true,
    ...overrides
  };
}

describe('retrospective report summary', () => {
  it('counts recommendations and excludes invalid and delay rows from hard savings', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({ id: 'move-1', workload_type: 'training' }),
        workload({
          id: 'delay-1',
          workload_type: 'batch',
          can_move: false,
          can_delay: true
        }),
        workload({
          id: 'pin-1',
          workload_type: 'inference',
          current_region: 'us-west-2',
          can_move: false,
          can_delay: false
        })
      ],
      regions,
      policy: { ...policy, carbon_ceiling_g_per_kwh: 200 },
      assumptions,
      invalid_rows: [
        {
          file: 'workloads',
          row: 5,
          id: 'bad-row',
          current_region: 'us-east-1',
          reason: 'gpu_count must be >= 1'
        }
      ]
    });

    expect(report.summary.total_workloads).toBe(4);
    expect(report.summary.valid_workloads).toBe(3);
    expect(report.summary.invalid_workloads).toBe(1);
    expect(report.summary.move_region_count).toBe(1);
    expect(report.summary.delay_count).toBe(1);
    expect(report.summary.pinned_count).toBe(1);
    expect(report.summary.movable_count).toBe(1);
    expect(report.summary.movable_percent).toBeCloseTo(33.3333, 4);
    expect(report.summary.pinned_percent).toBeCloseTo(33.3333, 4);
    expect(report.summary.hard_savings_usd).toBe(0.8);
    expect(report.summary.hard_savings_percent).toBeCloseTo(66.6667, 4);
    expect(report.summary.carbon_delta_g).toBe(-2000);
    expect(report.rows.find((row) => row.id === 'delay-1')?.counted_in_savings).toBe(false);
    expect(report.rows.find((row) => row.id === 'delay-1')?.reason).toContain(
      'This delay is not counted because no forecast data was provided'
    );
  });

  it('calculates carbon delta and report totals when no savings can be counted', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'pinned', current_region: 'us-west-2', can_move: false, can_delay: false })],
      regions,
      policy,
      assumptions
    });

    expect(report.summary.baseline_cost_usd).toBe(0.4);
    expect(report.summary.recommended_cost_usd).toBe(0.4);
    expect(report.summary.hard_savings_usd).toBe(0);
    expect(report.summary.hard_savings_percent).toBe(0);
    expect(report.summary.baseline_carbon_g).toBe(400);
    expect(report.summary.recommended_carbon_g).toBe(400);
    expect(report.summary.carbon_delta_g).toBe(0);
    expect(report.summary.carbon_delta_percent).toBe(0);
  });
});

describe('retrospective report breakdowns', () => {
  it('groups hard savings and blockers and sorts top opportunities', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({ id: 'big-save', workload_type: 'training', gpu_count: 8 }),
        workload({ id: 'small-save', workload_type: 'inference', gpu_count: 2 }),
        workload({ id: 'blocked', can_move: true, allowed_regions: ['us-east-1'], workload_type: 'batch' })
      ],
      regions,
      policy,
      assumptions
    });

    expect(report.breakdowns.savings_by_workload_type).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'training', hard_savings_usd: 1.6 }),
        expect.objectContaining({ key: 'inference', hard_savings_usd: 0.4 })
      ])
    );
    expect(report.breakdowns.savings_by_current_region).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'us-east-1', hard_savings_usd: 2 })])
    );
    expect(report.breakdowns.savings_by_recommended_region).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'us-west-2', hard_savings_usd: 2 })])
    );
    expect(report.breakdowns.recommendations_by_type.move_region).toBe(2);
    expect(report.breakdowns.confidence_breakdown.high).toBeGreaterThan(0);
    expect(report.breakdowns.blocked_reasons_count).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'region_policy', count: 1 })])
    );
    expect(report.breakdowns.top_savings_opportunities.map((row) => row.id)).toEqual(['big-save', 'small-save']);
  });
});

describe('retrospective batch capacity', () => {
  const capacityRegions: Region[] = [
    { ...regions[0], gpu_available: 64 },
    { ...regions[1], gpu_available: 8 },
    { ...regions[2], gpu_available: 8 }
  ];

  it('reserves destination capacity and chooses the next best region when the first fills', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({ id: 'job-a', gpu_count: 8 }),
        workload({ id: 'job-b', gpu_count: 8 })
      ],
      regions: capacityRegions,
      policy,
      assumptions
    });

    expect(report.rows.find((row) => row.id === 'job-a')?.recommended_region).toBe('us-west-2');
    expect(report.rows.find((row) => row.id === 'job-b')?.recommended_region).toBe('us-central-1');
    expect(
      report.rows
        .filter((row) => row.recommended_region === 'us-west-2' && row.recommendation_type === 'move_region')
        .reduce((sum, row) => sum + row.gpu_count, 0)
    ).toBe(8);
  });

  it('falls back to manual review when every allowed destination is out of capacity', () => {
    const report = buildRetrospectiveReport({
      workloads: [
        workload({ id: 'job-a', gpu_count: 8, allowed_regions: ['us-west-2'] }),
        workload({ id: 'job-b', gpu_count: 8, allowed_regions: ['us-west-2'] })
      ],
      regions: capacityRegions,
      policy,
      assumptions
    });

    const blocked = report.rows.find((row) => row.id === 'job-b');
    expect(blocked?.recommendation_type).toBe('manual_review');
    expect(blocked?.blocked_reasons).toContain('capacity');
    expect(report.summary.capacity_blocked_count).toBe(1);
  });
});

describe('retrospective policy handling', () => {
  it('never selects a blocked region', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'blocked-west' })],
      regions,
      policy: { ...policy, blocked_regions: ['us-west-2'] },
      assumptions
    });

    expect(report.rows[0].recommended_region).not.toBe('us-west-2');
  });

  it('respects data residency pins', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'resident', current_region: 'us-east-1', data_residency_region: 'us-east-1' })],
      regions,
      policy,
      assumptions
    });

    expect(report.rows[0].recommendation_type).toBe('pinned');
    expect(report.rows[0].blocked_reasons).toContain('data_residency');
  });

  it('keeps latency-sensitive workloads within latency limits', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'latency', latency_sensitive: true, max_latency_ms: 25 })],
      regions,
      policy,
      assumptions
    });

    expect(report.rows[0].recommended_region).toBe('us-east-1');
    expect(report.rows[0].blocked_reasons).toContain('latency');
  });

  it('uses the carbon ceiling to remove dirty regions from consideration', () => {
    const carbonRegions = [
      { ...regions[0], electricity_price_per_kwh: 0.05, carbon_intensity_g_per_kwh: 700 },
      { ...regions[1], electricity_price_per_kwh: 0.08, carbon_intensity_g_per_kwh: 500 },
      { ...regions[2], electricity_price_per_kwh: 0.12, carbon_intensity_g_per_kwh: 100 }
    ];

    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'carbon' })],
      regions: carbonRegions,
      policy: { ...policy, carbon_ceiling_g_per_kwh: 200 },
      assumptions
    });

    expect(report.rows[0].recommended_region).toBe('us-central-1');
    expect(report.rows[0].blocked_reasons).toContain('carbon_ceiling');
  });

  it('sends critical automatic moves to manual review', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'critical', priority: 'critical' })],
      regions,
      policy,
      assumptions
    });

    expect(report.rows[0].recommendation_type).toBe('manual_review');
    expect(report.rows[0].recommended_region).toBe('us-west-2');
    expect(report.rows[0].counted_in_savings).toBe(false);
  });
});

describe('retrospective exports', () => {
  it('exports full report JSON shape and workload CSV rows', () => {
    const report = buildRetrospectiveReport({
      workloads: [workload({ id: 'comma-reason' })],
      regions,
      policy,
      assumptions
    });

    const json = JSON.parse(JSON.stringify(report));
    expect(json.summary).toBeDefined();
    expect(json.breakdowns).toBeDefined();
    expect(json.rows).toHaveLength(1);
    expect(json.assumptions.cost_formula).toContain('estimated_kwh');

    report.rows[0].reason = 'Move, because cost is lower';
    const csv = workloadReportRowsToCsv(report.rows);

    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"Move, because cost is lower"');
  });
});
