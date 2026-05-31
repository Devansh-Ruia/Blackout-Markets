import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRegionCsv, parseWorkloadCsv } from './csv';
import { readPolicy } from './policy';
import { validateDataset } from './validation';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('customer data templates', () => {
  it('match the parser and validate as a minimal example dataset', () => {
    const workloads = parseWorkloadCsv(read('templates/workloads_template.csv'));
    const regions = parseRegionCsv(read('templates/regions_template.csv'));
    const policy = readPolicy(read('templates/policy_template.json'));

    expect(workloads.errors).toEqual([]);
    expect(regions.errors).toEqual([]);
    expect(policy.errors).toEqual([]);
    expect(validateDataset(workloads.rows, regions.rows, policy.policy)).toEqual([]);
  });
});
