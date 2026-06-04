import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './index.js';

let servers: Server[] = [];

async function startTestServer() {
  const app = createApp();
  const server = await new Promise<Server>((resolve, reject) => {
    const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer));
    nextServer.once('error', reject);
  });
  servers.push(server);

  const address = server.address() as AddressInfo;
  return `http://${address.address}:${address.port}`;
}

function fixturePath(name: string, file: string) {
  return join(process.cwd(), 'fixtures', name, file);
}

function fileBlob(path: string, type: string) {
  return new Blob([readFileSync(path, 'utf8')], { type });
}

function retrospectiveFixtureForm(name = 'normal-week') {
  const form = new FormData();
  form.append('workloads', fileBlob(fixturePath(name, 'workloads.csv'), 'text/csv'), 'workloads.csv');
  form.append('regions', fileBlob(fixturePath(name, 'regions.csv'), 'text/csv'), 'regions.csv');
  form.append('policy', readFileSync(fixturePath(name, 'policy.json'), 'utf8'));
  return form;
}

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
  servers = [];
});

describe('server API', () => {
  it('returns a retrospective report for valid fixture uploads', async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/api/report/retrospective`, {
      method: 'POST',
      body: retrospectiveFixtureForm('normal-week')
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.diagnostic.executive_summary).toContain('Based on uploaded data');
    expect(body.validation_errors).toEqual([]);
  });

  it('returns a clear non-500 response for missing fixture input', async () => {
    const baseUrl = await startTestServer();
    const form = new FormData();
    form.append('workloads', fileBlob(fixturePath('normal-week', 'workloads.csv'), 'text/csv'), 'workloads.csv');

    const response = await fetch(`${baseUrl}/api/report/retrospective`, {
      method: 'POST',
      body: form
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.validation_errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ file: 'regions', message: 'Upload region data' })])
    );
  });

  it('exports recommendation CSV', async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/api/export/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recommendations: [
          {
            workload_id: 'job-1',
            recommendation: 'move_region',
            current_region: 'us-east-1',
            recommended_region: 'us-west-2',
            delay_minutes: 0,
            baseline_cost_usd: 1,
            recommended_cost_usd: 0.5,
            estimated_savings_usd: 0.5,
            baseline_carbon_g: 100,
            recommended_carbon_g: 50,
            carbon_delta_g: -50,
            delay_impact: 'none',
            policy_reason: 'allowed',
            confidence: 'high',
            reason: 'cost lower',
            valid: true,
            priority: 'normal'
          }
        ]
      })
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(text).toContain('workload_id,recommendation');
    expect(text).toContain('job-1,move_region');
  });

  it('rejects malformed JSON without crashing the server', async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/api/report/retrospective`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    });
    const body = await response.json();
    const health = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Malformed JSON payload.');
    expect(health.status).toBe(200);
  });
});
