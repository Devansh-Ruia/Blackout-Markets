import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRegionCsv, parseWorkloadCsv } from './csv.js';
import { defaultPolicy, readPolicy } from './policy.js';
import { buildRetrospectiveReport } from './report.js';
import type { Assumptions, RecommendationType } from './types.js';
import { validateDataset } from './validation.js';

const assumptions: Assumptions = {
  gpu_kwh_assumption: 0.7,
  gpu_kwh_assumption_source: 'default',
  default_pue: 1.2
};

const fixtureRoot = 'fixtures';

const fixtureSets: Array<{
  name: string;
  expected: RecommendationType[];
}> = [
  { name: 'normal-week', expected: ['move_region', 'pinned'] },
  { name: 'grid-stress-week', expected: ['move_region', 'manual_review'] },
  { name: 'policy-heavy-week', expected: ['pinned', 'manual_review'] }
];

function text(path: string) {
  return readFileSync(path, 'utf8');
}

function loadFixture(name: string) {
  const dir = join(fixtureRoot, name);
  const workloads = parseWorkloadCsv(text(join(dir, 'workloads.csv')));
  const regions = parseRegionCsv(text(join(dir, 'regions.csv')));
  const policyPath = join(dir, 'policy.json');

  let policy = defaultPolicy;
  try {
    policy = readPolicy(text(policyPath)).policy;
  } catch {
    policy = defaultPolicy;
  }

  return { workloads, regions, policy };
}

describe('fixture datasets', () => {
  it.each(fixtureSets)('$name parses and produces expected recommendation types', ({ name, expected }) => {
    const fixture = loadFixture(name);

    expect(fixture.workloads.errors).toEqual([]);
    expect(fixture.regions.errors).toEqual([]);
    expect(validateDataset(fixture.workloads.rows, fixture.regions.rows, fixture.policy)).toEqual([]);

    const report = buildRetrospectiveReport({
      workloads: fixture.workloads.rows,
      regions: fixture.regions.rows,
      policy: fixture.policy,
      assumptions
    });
    const recommendationTypes = new Set(report.rows.map((row) => row.recommendation_type));

    for (const type of expected) {
      expect(recommendationTypes.has(type)).toBe(true);
    }
  });
});
