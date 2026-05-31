import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const outRoot = join(process.cwd(), '.tmp-demo-report-tests');

function cleanOut() {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
}

async function runDemoReports(options: { fixtureRoot?: string; outRoot?: string }) {
  const mod = await import('./demoReports');
  const messages: string[] = [];
  const errors: string[] = [];
  const code = await mod.runDemoReports(options, {
    log: (message) => messages.push(message),
    error: (message) => errors.push(message)
  });
  return { code, messages, errors };
}

describe('demo report CLI', () => {
  it('generates demo reports for every fixture dataset', async () => {
    cleanOut();

    const result = await runDemoReports({ fixtureRoot: 'fixtures', outRoot });

    expect(result.code).toBe(0);
    expect(result.messages.join('\n')).toContain('Generated demo reports');

    for (const name of ['normal-week', 'grid-stress-week', 'policy-heavy-week']) {
      const dir = join(outRoot, name);
      expect(existsSync(join(dir, 'report.json'))).toBe(true);
      expect(existsSync(join(dir, 'recommendations.csv'))).toBe(true);
      expect(existsSync(join(dir, 'diagnostic.md'))).toBe(true);
      expect(readFileSync(join(dir, 'report.json'), 'utf8').trim()).not.toBe('');
      expect(readFileSync(join(dir, 'recommendations.csv'), 'utf8')).toContain('recommendation');
      expect(readFileSync(join(dir, 'diagnostic.md'), 'utf8')).toContain('# Blackout Markets Diagnostic Report');
    }
  });

  it('fails clearly when a fixture file is missing', async () => {
    cleanOut();
    const result = await runDemoReports({ fixtureRoot: join(outRoot, 'missing-fixtures'), outRoot });

    expect(result.code).toBe(1);
    expect(result.errors.join('\n')).toContain('Missing fixture file for normal-week');
    expect(result.errors.join('\n')).toContain('workloads.csv');
  });
});
