import { describe, expect, it } from 'vitest';
import { parseRegionCsv, parseWorkloadCsv } from './csv';

describe('CSV parsing and validation', () => {
  it('returns row-level errors for malformed workload CSV values', () => {
    const csv = [
      'id,workload_type,gpu_type,gpu_count,expected_duration_minutes,current_region,priority,latency_sensitive,can_delay,can_move,checkpointable',
      'job-1,training,h100,-1,60,us-east-1,urgent,maybe,true,true,true'
    ].join('\n');

    const result = parseWorkloadCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: 'gpu_count' }),
        expect.objectContaining({ row: 2, field: 'priority' }),
        expect.objectContaining({ row: 2, field: 'latency_sensitive' })
      ])
    );
  });

  it('rejects duplicate workload IDs', () => {
    const csv = [
      'id,workload_type,gpu_type,gpu_count,expected_duration_minutes,current_region,priority,latency_sensitive,can_delay,can_move,checkpointable',
      'job-1,training,h100,1,60,us-east-1,normal,false,true,true,true',
      'job-1,inference,l40,1,20,us-east-1,low,false,true,true,true'
    ].join('\n');

    const result = parseWorkloadCsv(csv);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, field: 'id', message: expect.stringContaining('Duplicate') })
      ])
    );
  });

  it('parses allowed regions as pipe-separated values', () => {
    const csv = [
      'id,workload_type,gpu_type,gpu_count,expected_duration_minutes,current_region,allowed_regions,priority,latency_sensitive,can_delay,can_move,checkpointable',
      'job-1,training,h100,1,60,us-east-1,us-east-1|us-west-2,normal,false,true,true,true'
    ].join('\n');

    const result = parseWorkloadCsv(csv);

    expect(result.rows[0].allowed_regions).toEqual(['us-east-1', 'us-west-2']);
  });

  it('rejects empty region files', () => {
    const result = parseRegionCsv('');

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'regions', message: expect.stringContaining('empty') })
      ])
    );
  });
});
