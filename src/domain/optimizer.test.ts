import { describe, expect, it } from 'vitest';
import { optimize } from './optimizer';
import type { Assumptions, Policy, Region, Workload } from './types';

const assumptions: Assumptions = {
  gpu_kwh_assumption: 0.7,
  gpu_kwh_assumption_source: 'default'
};

const policy: Policy = {
  max_delay_minutes: 120,
  allowed_regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
  blocked_regions: [],
  carbon_ceiling_g_per_kwh: null,
  max_latency_ms: null,
  require_manual_for_low_confidence: true
};

const regions: Region[] = [
  {
    region: 'us-east-1',
    electricity_price_per_kwh: 0.2,
    carbon_intensity_g_per_kwh: 500,
    gpu_available: 8,
    grid_stress: 'medium',
    pue: 1.2,
    avg_latency_ms: 20,
    reliability_score: 0.98
  },
  {
    region: 'us-west-2',
    electricity_price_per_kwh: 0.08,
    carbon_intensity_g_per_kwh: 120,
    gpu_available: 8,
    grid_stress: 'low',
    pue: 1.1,
    avg_latency_ms: 70,
    reliability_score: 0.96
  },
  {
    region: 'eu-west-1',
    electricity_price_per_kwh: 0.11,
    carbon_intensity_g_per_kwh: 220,
    gpu_available: 8,
    grid_stress: 'high',
    pue: 1.25,
    avg_latency_ms: 140,
    reliability_score: 0.88
  }
];

function workload(overrides: Partial<Workload> = {}): Workload {
  return {
    id: 'job-1',
    workload_type: 'training',
    gpu_type: 'h100',
    gpu_count: 4,
    expected_duration_minutes: 60,
    deadline_minutes_from_now: 240,
    current_region: 'us-east-1',
    allowed_regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    priority: 'normal',
    latency_sensitive: false,
    can_delay: true,
    can_move: true,
    checkpointable: true,
    ...overrides
  };
}

function pick(workloads: Workload[], localPolicy = policy, localRegions = regions) {
  return optimize(workloads, localRegions, localPolicy, assumptions).recommendations[0];
}

describe('optimize', () => {
  it('keeps a pinned workload from moving', () => {
    const result = pick([workload({ can_move: false })]);

    expect(result.recommendation).toBe('pinned');
    expect(result.recommended_region).toBe('us-east-1');
    expect(result.reason).toContain('cannot move');
  });

  it('does not delay a non-delayable workload', () => {
    const localPolicy = { ...policy, allowed_regions: ['us-east-1'] };

    const result = pick([workload({ can_delay: false, can_move: false })], localPolicy);

    expect(result.delay_minutes).toBe(0);
    expect(result.recommendation).toBe('pinned');
    expect(result.reason).toContain('cannot move');
  });

  it('never selects a blocked region', () => {
    const result = pick([workload()], { ...policy, blocked_regions: ['us-west-2'] });

    expect(result.recommended_region).not.toBe('us-west-2');
  });

  it('respects data residency pins', () => {
    const result = pick([workload({ data_residency_region: 'us-east-1' })]);

    expect(result.recommendation).toBe('pinned');
    expect(result.reason).toContain('data residency');
  });

  it('uses deadline to prevent delay past the window', () => {
    const localPolicy = { ...policy, allowed_regions: ['us-east-1'] };
    const result = pick([workload({ deadline_minutes_from_now: 30 })], localPolicy);

    expect(result.recommendation).toBe('run_now');
    expect(result.delay_minutes).toBe(0);
    expect(result.reason).toContain('deadline');
  });

  it('requires enough GPU capacity before moving', () => {
    const noCapacity = regions.map((region) =>
      region.region === 'us-west-2' ? { ...region, gpu_available: 2 } : region
    );

    const result = pick([workload()], policy, noCapacity);

    expect(result.recommended_region).not.toBe('us-west-2');
  });

  it('keeps latency-sensitive workloads within the latency limit', () => {
    const result = pick([
      workload({ latency_sensitive: true, max_latency_ms: 40 })
    ]);

    expect(result.recommended_region).toBe('us-east-1');
    expect(result.reason).toContain('latency');
  });

  it('sends critical workloads to manual review instead of risky automatic moves', () => {
    const result = pick([workload({ priority: 'critical' })]);

    expect(result.recommendation).toBe('manual_review');
    expect(result.reason).toContain('critical');
  });

  it('uses the carbon ceiling to change the recommendation', () => {
    const localPolicy = {
      ...policy,
      allowed_regions: ['us-east-1'],
      carbon_ceiling_g_per_kwh: 200
    };

    const result = pick([workload()], localPolicy);

    expect(result.recommendation).toBe('delay');
    expect(result.reason).toContain('carbon ceiling');
  });
});
