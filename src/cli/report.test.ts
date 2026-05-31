import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const outRoot = join(process.cwd(), '.tmp-report-tests');

async function runCli(args: string[]) {
  const mod = (await import('./report')) as any;
  const messages: string[] = [];
  const errors: string[] = [];
  const code = await mod.runReportCli(args, {
    log: (message: string) => messages.push(message),
    error: (message: string) => errors.push(message)
  });
  return { code, messages, errors };
}

function cleanOut() {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
}

describe('report CLI', () => {
  it('generates report.json recommendations.csv and diagnostic.md', async () => {
    cleanOut();
    const outDir = join(outRoot, 'normal-week');

    const result = await runCli([
      '--workloads',
      'fixtures/normal-week/workloads.csv',
      '--regions',
      'fixtures/normal-week/regions.csv',
      '--policy',
      'fixtures/normal-week/policy.json',
      '--out',
      outDir
    ]);

    expect(result.code).toBe(0);
    expect(existsSync(join(outDir, 'report.json'))).toBe(true);
    expect(existsSync(join(outDir, 'recommendations.csv'))).toBe(true);
    expect(existsSync(join(outDir, 'diagnostic.md'))).toBe(true);
    expect(readFileSync(join(outDir, 'diagnostic.md'), 'utf8')).toContain('# Blackout Markets Diagnostic Report');
    expect(JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')).diagnostic).toBeDefined();
  });

  it('fails clearly on a missing file path', async () => {
    cleanOut();
    const result = await runCli([
      '--workloads',
      'fixtures/missing.csv',
      '--regions',
      'fixtures/normal-week/regions.csv',
      '--policy',
      'fixtures/normal-week/policy.json',
      '--out',
      join(outRoot, 'missing')
    ]);

    expect(result.code).toBe(1);
    expect(result.errors.join('\n')).toContain('Input file not found');
  });

  it('fails clearly when required options are missing', async () => {
    cleanOut();
    const result = await runCli([
      '--workloads',
      'fixtures/normal-week/workloads.csv',
      '--regions',
      'fixtures/normal-week/regions.csv'
    ]);

    expect(result.code).toBe(1);
    expect(result.errors.join('\n')).toContain('Missing required option --policy');
    expect(result.errors.join('\n')).toContain('Missing required option --out');
  });

  it('fails clearly on invalid CSV', async () => {
    cleanOut();
    const invalidCsv = join(outRoot, 'invalid-workloads.csv');
    mkdirSync(outRoot, { recursive: true });
    await import('node:fs').then((fs) =>
      fs.writeFileSync(invalidCsv, 'id,workload_type,gpu_type,gpu_count\nbad,batch,a100,0\n')
    );

    const result = await runCli([
      '--workloads',
      invalidCsv,
      '--regions',
      'fixtures/normal-week/regions.csv',
      '--policy',
      'fixtures/normal-week/policy.json',
      '--out',
      join(outRoot, 'invalid')
    ]);

    expect(result.code).toBe(1);
    expect(result.errors.join('\n')).toContain('Workload CSV is invalid');
  });

  it('fails clearly on invalid policy JSON', async () => {
    cleanOut();
    const invalidPolicy = join(outRoot, 'invalid-policy.json');
    await import('node:fs').then((fs) => fs.writeFileSync(invalidPolicy, '{not-json'));

    const result = await runCli([
      '--workloads',
      'fixtures/normal-week/workloads.csv',
      '--regions',
      'fixtures/normal-week/regions.csv',
      '--policy',
      invalidPolicy,
      '--out',
      join(outRoot, 'invalid-policy')
    ]);

    expect(result.code).toBe(1);
    expect(result.errors.join('\n')).toContain('Policy is invalid');
  });

  it('fails clearly when files do not validate together', async () => {
    cleanOut();
    const workloadCsv = join(outRoot, 'unknown-region-workloads.csv');
    const text = readFileSync('fixtures/normal-week/workloads.csv', 'utf8').replace('us-east-1', 'missing-region');
    await import('node:fs').then((fs) => fs.writeFileSync(workloadCsv, text));

    const result = await runCli([
      '--workloads',
      workloadCsv,
      '--regions',
      'fixtures/normal-week/regions.csv',
      '--policy',
      'fixtures/normal-week/policy.json',
      '--out',
      join(outRoot, 'invalid-together')
    ]);

    expect(result.code).toBe(1);
    expect(result.errors.join('\n')).toContain('Input files are invalid together');
    expect(result.errors.join('\n')).toContain('missing current_region');
  });

  it('writes custom assumptions when CLI assumption flags are provided', async () => {
    cleanOut();
    const outDir = join(outRoot, 'custom-assumptions');

    const result = await runCli([
      '--workloads',
      'fixtures/normal-week/workloads.csv',
      '--regions',
      'fixtures/normal-week/regions.csv',
      '--policy',
      'fixtures/normal-week/policy.json',
      '--out',
      outDir,
      '--gpu-kwh-assumption',
      '0.9',
      '--default-pue',
      '1.15'
    ]);
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));

    expect(result.code).toBe(0);
    expect(report.assumptions.gpu_kwh_assumption).toBe(0.9);
    expect(report.assumptions.gpu_kwh_assumption_source).toBe('user');
    expect(report.assumptions.default_pue).toBe(1.15);
  });

  it.each(['normal-week', 'grid-stress-week', 'policy-heavy-week'])('works with %s fixture dataset', async (name) => {
    cleanOut();
    const outDir = join(outRoot, name);

    const result = await runCli([
      '--workloads',
      `fixtures/${name}/workloads.csv`,
      '--regions',
      `fixtures/${name}/regions.csv`,
      '--policy',
      `fixtures/${name}/policy.json`,
      '--out',
      outDir
    ]);

    expect(result.code).toBe(0);
    expect(existsSync(join(outDir, 'report.json'))).toBe(true);
    expect(readFileSync(join(outDir, 'recommendations.csv'), 'utf8')).toContain('recommendation');
    expect(readFileSync(join(outDir, 'diagnostic.md'), 'utf8')).toContain('## Recommended Next Step');
  });
});
