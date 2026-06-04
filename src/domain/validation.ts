import type { Policy, Region, ValidationError, Workload } from './types.js';

export function validatePolicy(policy: Policy, regions: Region[] = []): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Number.isFinite(policy.max_delay_minutes) || policy.max_delay_minutes < 0) {
    errors.push({
      file: 'policy',
      field: 'max_delay_minutes',
      message: 'max_delay_minutes must be >= 0'
    });
  }

  if (policy.carbon_ceiling_g_per_kwh !== null && policy.carbon_ceiling_g_per_kwh < 0) {
    errors.push({
      file: 'policy',
      field: 'carbon_ceiling_g_per_kwh',
      message: 'carbon_ceiling_g_per_kwh must be >= 0'
    });
  }

  if (policy.max_latency_ms !== null && policy.max_latency_ms < 0) {
    errors.push({ file: 'policy', field: 'max_latency_ms', message: 'max_latency_ms must be >= 0' });
  }

  const allowed = new Set(policy.allowed_regions);
  const blocked = new Set(policy.blocked_regions);
  const overlap = [...allowed].filter((region) => blocked.has(region));
  if (overlap.length > 0) {
    errors.push({
      file: 'policy',
      field: 'blocked_regions',
      message: `Regions cannot be both allowed and blocked: ${overlap.join(', ')}`
    });
  }

  if (regions.length > 0) {
    const regionNames = new Set(regions.map((region) => region.region));
    for (const region of [...policy.allowed_regions, ...policy.blocked_regions]) {
      if (!regionNames.has(region)) {
        errors.push({ file: 'policy', field: 'allowed_regions', message: `Policy references unknown region ${region}` });
      }
    }

    const base = policy.allowed_regions.length > 0 ? policy.allowed_regions : [...regionNames];
    const viable = base.filter((region) => regionNames.has(region) && !blocked.has(region));
    if (viable.length === 0) {
      errors.push({
        file: 'policy',
        field: 'allowed_regions',
        message: 'Policy leaves no allowed region after blocked regions are applied'
      });
    }
  }

  return errors;
}

export function validateDataset(workloads: Workload[], regions: Region[], policy: Policy): ValidationError[] {
  const errors = validatePolicy(policy, regions);
  const regionNames = new Set(regions.map((region) => region.region));

  for (const [index, workload] of workloads.entries()) {
    const row = index + 2;
    if (!regionNames.has(workload.current_region)) {
      errors.push({
        file: 'workloads',
        row,
        field: 'current_region',
        message: `Workload ${workload.id} references missing current_region ${workload.current_region}`
      });
    }

    for (const region of workload.allowed_regions ?? []) {
      if (!regionNames.has(region)) {
        errors.push({
          file: 'workloads',
          row,
          field: 'allowed_regions',
          message: `Workload ${workload.id} allowed_regions references missing region ${region}`
        });
      }
    }

    if (workload.data_residency_region && !regionNames.has(workload.data_residency_region)) {
      errors.push({
        file: 'workloads',
        row,
        field: 'data_residency_region',
        message: `Workload ${workload.id} data_residency_region is not present in region data`
      });
    }
  }

  return errors;
}
