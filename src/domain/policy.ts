import type { Policy, ValidationError } from './types.js';

export const defaultPolicy: Policy = {
  max_delay_minutes: 60,
  allowed_regions: [],
  blocked_regions: [],
  carbon_ceiling_g_per_kwh: null,
  max_latency_ms: null,
  require_manual_for_low_confidence: true
};

function list(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readPolicy(raw: unknown): { policy: Policy; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  let obj: Record<string, unknown> = {};

  if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      errors.push({ file: 'policy', message: 'Policy JSON is malformed' });
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }

  const max_delay_minutes = Number(obj.max_delay_minutes ?? defaultPolicy.max_delay_minutes);
  if (!Number.isFinite(max_delay_minutes)) {
    errors.push({ file: 'policy', field: 'max_delay_minutes', message: 'max_delay_minutes must be a number' });
  }

  return {
    policy: {
      max_delay_minutes: Number.isFinite(max_delay_minutes) ? max_delay_minutes : defaultPolicy.max_delay_minutes,
      allowed_regions: list(obj.allowed_regions),
      blocked_regions: list(obj.blocked_regions),
      carbon_ceiling_g_per_kwh: nullableNumber(obj.carbon_ceiling_g_per_kwh),
      max_latency_ms: nullableNumber(obj.max_latency_ms),
      require_manual_for_low_confidence:
        typeof obj.require_manual_for_low_confidence === 'boolean'
          ? obj.require_manual_for_low_confidence
          : defaultPolicy.require_manual_for_low_confidence
    },
    errors
  };
}
