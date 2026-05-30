export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type GridStress = 'low' | 'medium' | 'high';
export type RecommendationType =
  | 'run_now'
  | 'delay'
  | 'move_region'
  | 'manual_review'
  | 'pinned'
  | 'invalid';
export type Confidence = 'high' | 'medium' | 'low';

export interface Workload {
  id: string;
  customer_id?: string;
  workload_type: string;
  gpu_type: string;
  gpu_count: number;
  expected_duration_minutes: number;
  deadline_minutes_from_now?: number;
  current_region: string;
  allowed_regions?: string[];
  priority: Priority;
  latency_sensitive: boolean;
  max_latency_ms?: number;
  can_delay: boolean;
  can_move: boolean;
  checkpointable: boolean;
  data_residency_region?: string;
  estimated_revenue_usd?: number;
}

export interface Region {
  region: string;
  electricity_price_per_kwh: number;
  carbon_intensity_g_per_kwh: number;
  gpu_available: number;
  grid_stress: GridStress;
  pue?: number;
  avg_latency_ms?: number;
  reliability_score?: number;
}

export interface Policy {
  max_delay_minutes: number;
  allowed_regions: string[];
  blocked_regions: string[];
  carbon_ceiling_g_per_kwh: number | null;
  max_latency_ms: number | null;
  require_manual_for_low_confidence: boolean;
}

export interface Assumptions {
  gpu_kwh_assumption: number;
  gpu_kwh_assumption_source: 'default' | 'user';
}

export interface ValidationError {
  file?: 'workloads' | 'regions' | 'policy';
  row?: number;
  field?: string;
  message: string;
}

export interface InvalidRow {
  file: 'workloads' | 'regions';
  row: number;
  id?: string;
  current_region?: string;
  priority?: Priority;
  reason: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: ValidationError[];
  invalid_rows: InvalidRow[];
}

export interface CostEstimate {
  estimated_kwh: number;
  cost_usd: number;
  carbon_g: number;
}

export interface Recommendation {
  workload_id: string;
  recommendation: RecommendationType;
  current_region: string;
  recommended_region: string;
  delay_minutes: number;
  baseline_cost_usd: number;
  recommended_cost_usd: number;
  estimated_savings_usd: number;
  baseline_carbon_g: number;
  recommended_carbon_g: number;
  carbon_delta_g: number;
  delay_impact: string;
  policy_reason: string;
  confidence: Confidence;
  reason: string;
  valid: boolean;
  priority: Priority;
}

export interface OptimizationReport {
  generated_at: string;
  assumptions: Assumptions;
  summary: {
    total_workloads: number;
    workloads_movable: number;
    workloads_delayed: number;
    workloads_pinned: number;
    invalid_workloads: number;
    estimated_total_savings_usd: number;
    estimated_carbon_delta_g: number;
  };
  recommendations: Recommendation[];
  validation_errors: ValidationError[];
}
