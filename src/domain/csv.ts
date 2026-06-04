import { parse } from 'csv-parse/sync';
import type { GridStress, ParseResult, Priority, Region, ValidationError, Workload } from './types.js';

const workloadHeaders = [
  'id',
  'workload_type',
  'gpu_type',
  'gpu_count',
  'expected_duration_minutes',
  'current_region',
  'priority',
  'latency_sensitive',
  'can_delay',
  'can_move',
  'checkpointable'
];

const regionHeaders = [
  'region',
  'electricity_price_per_kwh',
  'carbon_intensity_g_per_kwh',
  'gpu_available',
  'grid_stress'
];

const priorities: Priority[] = ['low', 'normal', 'high', 'critical'];
const stresses: GridStress[] = ['low', 'medium', 'high'];

type CsvFile = 'workloads' | 'regions';

function readCsv(text: string, file: CsvFile) {
  if (!text.trim()) {
    return { records: [], errors: [{ file, message: `${file} CSV is empty` }] as ValidationError[] };
  }

  try {
    const records = parse(text, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true
    }) as string[][];

    if (records.length === 0) {
      return { records: [], errors: [{ file, message: `${file} CSV is empty` }] as ValidationError[] };
    }

    return { records, errors: [] as ValidationError[] };
  } catch (error) {
    return {
      records: [],
      errors: [
        {
          file,
          message: `Could not parse ${file} CSV: ${error instanceof Error ? error.message : String(error)}`
        }
      ] as ValidationError[]
    };
  }
}

function headerErrors(headers: string[], required: string[], file: CsvFile): ValidationError[] {
  return required
    .filter((header) => !headers.includes(header))
    .map((header) => ({ file, field: header, message: `Missing required header ${header}` }));
}

function rowObject(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>((obj, header, index) => {
    obj[header] = row[index] ?? '';
    return obj;
  }, {});
}

function requiredString(
  obj: Record<string, string>,
  field: string,
  row: number,
  file: CsvFile,
  errors: ValidationError[]
) {
  const value = obj[field]?.trim();
  if (!value) {
    errors.push({ file, row, field, message: `${field} is required` });
    return '';
  }
  return value;
}

function numberField(
  obj: Record<string, string>,
  field: string,
  row: number,
  file: CsvFile,
  errors: ValidationError[],
  options: { required?: boolean; integer?: boolean; min?: number; max?: number } = {}
) {
  const raw = obj[field]?.trim();
  if (!raw) {
    if (options.required) errors.push({ file, row, field, message: `${field} is required` });
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    errors.push({ file, row, field, message: `${field} must be a number` });
    return undefined;
  }

  if (options.integer && !Number.isInteger(value)) {
    errors.push({ file, row, field, message: `${field} must be an integer` });
  }

  if (options.min !== undefined && value < options.min) {
    errors.push({ file, row, field, message: `${field} must be >= ${options.min}` });
  }

  if (options.max !== undefined && value > options.max) {
    errors.push({ file, row, field, message: `${field} must be <= ${options.max}` });
  }

  return value;
}

function boolField(obj: Record<string, string>, field: string, row: number, errors: ValidationError[]) {
  const raw = obj[field]?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push({ file: 'workloads', row, field, message: `${field} must be true or false` });
  return undefined;
}

function enumField<T extends string>(
  obj: Record<string, string>,
  field: string,
  row: number,
  file: CsvFile,
  values: readonly T[],
  errors: ValidationError[]
) {
  const raw = obj[field]?.trim();
  if (!values.includes(raw as T)) {
    errors.push({ file, row, field, message: `${field} must be one of ${values.join(', ')}` });
    return undefined;
  }
  return raw as T;
}

function parseRegionList(raw: string | undefined, row: number, errors: ValidationError[]) {
  if (!raw?.trim()) return undefined;
  if (raw.startsWith('|') || raw.endsWith('|') || raw.includes('||')) {
    errors.push({
      file: 'workloads',
      row,
      field: 'allowed_regions',
      message: 'allowed_regions must be pipe-separated region names without empty entries'
    });
    return undefined;
  }

  const values = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (values.length === 0) return undefined;
  return Array.from(new Set(values));
}

export function parseWorkloadCsv(text: string): ParseResult<Workload> {
  const parsed = readCsv(text, 'workloads');
  const errors = [...parsed.errors];
  const rows: Workload[] = [];
  const invalid_rows: ParseResult<Workload>['invalid_rows'] = [];
  if (parsed.records.length === 0) return { rows, errors, invalid_rows };

  const [headers, ...data] = parsed.records;
  errors.push(...headerErrors(headers, workloadHeaders, 'workloads'));
  if (errors.length > 0) return { rows, errors, invalid_rows };

  const ids = new Set<string>();

  data.forEach((cells, index) => {
    const row = index + 2;
    const rowErrors: ValidationError[] = [];
    const obj = rowObject(headers, cells);

    if (cells.length !== headers.length) {
      rowErrors.push({
        file: 'workloads',
        row,
        message: `Malformed row has ${cells.length} columns, expected ${headers.length}`
      });
    }

    const id = requiredString(obj, 'id', row, 'workloads', rowErrors);
    if (id && ids.has(id)) {
      rowErrors.push({ file: 'workloads', row, field: 'id', message: `Duplicate workload ID ${id}` });
    }

    const workload_type = requiredString(obj, 'workload_type', row, 'workloads', rowErrors);
    const gpu_type = requiredString(obj, 'gpu_type', row, 'workloads', rowErrors);
    const gpu_count = numberField(obj, 'gpu_count', row, 'workloads', rowErrors, {
      required: true,
      integer: true,
      min: 1
    });
    const expected_duration_minutes = numberField(obj, 'expected_duration_minutes', row, 'workloads', rowErrors, {
      required: true,
      min: 0.000001
    });
    const deadline_minutes_from_now = numberField(obj, 'deadline_minutes_from_now', row, 'workloads', rowErrors, {
      min: 0
    });
    const current_region = requiredString(obj, 'current_region', row, 'workloads', rowErrors);
    const allowed_regions = parseRegionList(obj.allowed_regions, row, rowErrors);
    const priority = enumField(obj, 'priority', row, 'workloads', priorities, rowErrors);
    const latency_sensitive = boolField(obj, 'latency_sensitive', row, rowErrors);
    const max_latency_ms = numberField(obj, 'max_latency_ms', row, 'workloads', rowErrors, { min: 0 });
    const can_delay = boolField(obj, 'can_delay', row, rowErrors);
    const can_move = boolField(obj, 'can_move', row, rowErrors);
    const checkpointable = boolField(obj, 'checkpointable', row, rowErrors);
    const estimated_revenue_usd = numberField(obj, 'estimated_revenue_usd', row, 'workloads', rowErrors, {
      min: 0
    });

    if (latency_sensitive && max_latency_ms === undefined) {
      rowErrors.push({
        file: 'workloads',
        row,
        field: 'max_latency_ms',
        message: 'max_latency_ms is required when latency_sensitive is true'
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      invalid_rows.push({
        file: 'workloads',
        row,
        id: id || undefined,
        current_region: current_region || undefined,
        priority,
        reason: rowErrors.map((error) => error.message).join('; ')
      });
      return;
    }

    ids.add(id);
    rows.push({
      id,
      customer_id: obj.customer_id?.trim() || undefined,
      workload_type,
      gpu_type,
      gpu_count: gpu_count!,
      expected_duration_minutes: expected_duration_minutes!,
      deadline_minutes_from_now,
      current_region,
      allowed_regions,
      priority: priority!,
      latency_sensitive: latency_sensitive!,
      max_latency_ms,
      can_delay: can_delay!,
      can_move: can_move!,
      checkpointable: checkpointable!,
      data_residency_region: obj.data_residency_region?.trim() || undefined,
      estimated_revenue_usd
    });
  });

  return { rows, errors, invalid_rows };
}

export function parseRegionCsv(text: string): ParseResult<Region> {
  const parsed = readCsv(text, 'regions');
  const errors = [...parsed.errors];
  const rows: Region[] = [];
  const invalid_rows: ParseResult<Region>['invalid_rows'] = [];
  if (parsed.records.length === 0) return { rows, errors, invalid_rows };

  const [headers, ...data] = parsed.records;
  errors.push(...headerErrors(headers, regionHeaders, 'regions'));
  if (errors.length > 0) return { rows, errors, invalid_rows };

  const names = new Set<string>();

  data.forEach((cells, index) => {
    const row = index + 2;
    const rowErrors: ValidationError[] = [];
    const obj = rowObject(headers, cells);

    if (cells.length !== headers.length) {
      rowErrors.push({
        file: 'regions',
        row,
        message: `Malformed row has ${cells.length} columns, expected ${headers.length}`
      });
    }

    const region = requiredString(obj, 'region', row, 'regions', rowErrors);
    if (region && names.has(region)) {
      rowErrors.push({ file: 'regions', row, field: 'region', message: `Duplicate region ${region}` });
    }

    const electricity_price_per_kwh = numberField(obj, 'electricity_price_per_kwh', row, 'regions', rowErrors, {
      required: true,
      min: 0
    });
    const carbon_intensity_g_per_kwh = numberField(obj, 'carbon_intensity_g_per_kwh', row, 'regions', rowErrors, {
      required: true,
      min: 0
    });
    const gpu_available = numberField(obj, 'gpu_available', row, 'regions', rowErrors, {
      required: true,
      integer: true,
      min: 0
    });
    const grid_stress = enumField(obj, 'grid_stress', row, 'regions', stresses, rowErrors);
    const pue = numberField(obj, 'pue', row, 'regions', rowErrors, { min: 1 });
    const avg_latency_ms = numberField(obj, 'avg_latency_ms', row, 'regions', rowErrors, { min: 0 });
    const reliability_score = numberField(obj, 'reliability_score', row, 'regions', rowErrors, { min: 0, max: 1 });

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      invalid_rows.push({
        file: 'regions',
        row,
        id: region || undefined,
        reason: rowErrors.map((error) => error.message).join('; ')
      });
      return;
    }

    names.add(region);
    rows.push({
      region,
      electricity_price_per_kwh: electricity_price_per_kwh!,
      carbon_intensity_g_per_kwh: carbon_intensity_g_per_kwh!,
      gpu_available: gpu_available!,
      grid_stress: grid_stress!,
      pue,
      avg_latency_ms,
      reliability_score
    });
  });

  if (data.length === 0) {
    errors.push({ file: 'regions', message: 'regions CSV has headers but no rows' });
  }

  return { rows, errors, invalid_rows };
}
