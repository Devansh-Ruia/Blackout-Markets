import { describe, expect, it } from 'vitest';
import { validateDataset, validatePolicy } from './validation.js';
import type { Policy, Region, Workload } from './types.js';

const policy: Policy = {
  max_delay_minutes: 60,
  allowed_regions: [],
  blocked_regions: [],
  carbon_ceiling_g_per_kwh: null,
  max_latency_ms: null,
  require_manual_for_low_confidence: true
};

const regions: Region[] = [
  {
    region: 'us-east-1',
    electricity_price_per_kwh: 0.2,
    carbon_intensity_g_per_kwh: 400,
    gpu_available: 4,
    grid_stress: 'low'
  }
];

const workload: Workload = {
  id: 'job-1',
  workload_type: 'training',
  gpu_type: 'h100',
  gpu_count: 1,
  expected_duration_minutes: 30,
  current_region: 'missing-region',
  priority: 'normal',
  latency_sensitive: false,
  can_delay: true,
  can_move: true,
  checkpointable: true
};

describe('validation', () => {
  it('reports workload regions missing from region data', () => {
    const errors = validateDataset([workload], regions, policy);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'current_region',
          message: expect.stringContaining('missing current_region')
        })
      ])
    );
  });

  it('rejects impossible policy region combinations', () => {
    const errors = validatePolicy(
      {
        ...policy,
        allowed_regions: ['us-east-1'],
        blocked_regions: ['us-east-1']
      },
      regions
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('both allowed and blocked') }),
        expect.objectContaining({ message: expect.stringContaining('no allowed region') })
      ])
    );
  });
});
