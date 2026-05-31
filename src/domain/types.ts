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
export type DataQualityLevel = 'high' | 'medium' | 'low';

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
  default_pue?: number;
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
  capacity_checked: boolean;
  capacity_reserved: number;
  remaining_region_capacity_after_assignment: number | null;
  capacity_reason: string | null;
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

export interface EstimateAssumptions {
  region: string;
  gpu_count: number;
  expected_duration_hours: number;
  gpu_kwh_assumption: number;
  gpu_kwh_assumption_source: 'default' | 'user';
  pue: number;
  pue_source: 'region' | 'default';
  electricity_price_per_kwh: number;
  carbon_intensity_g_per_kwh: number;
  estimated_kwh: number;
}

export interface WorkloadReportRow {
  id: string;
  customer_id?: string;
  workload_type: string;
  gpu_type: string;
  gpu_count: number;
  expected_duration_minutes: number;
  expected_duration_hours: number;
  current_region: string;
  recommended_region: string | null;
  recommendation_type: RecommendationType;
  recommendation: RecommendationType;
  baseline_cost_usd: number;
  recommended_cost_usd: number;
  hard_savings_usd: number;
  estimated_savings_usd: number;
  baseline_carbon_g: number;
  recommended_carbon_g: number;
  carbon_delta_g: number;
  delay_minutes: number;
  confidence: Confidence;
  reason: string;
  blocked_reasons: string[];
  could_not_move_reasons: string[];
  counted_in_savings: boolean;
  valid: boolean;
  priority: Priority;
  latency_sensitive: boolean;
  validation_errors: string[];
  capacity_checked: boolean;
  capacity_reserved: number;
  remaining_region_capacity_after_assignment: number | null;
  capacity_reason: string | null;
  assumptions: {
    baseline: EstimateAssumptions | null;
    recommended: EstimateAssumptions | null;
    hard_savings_rule: string;
  };
}

export interface SavingsRange {
  low_usd: number;
  expected_usd: number;
  high_usd: number;
  note: string;
}

export interface DataQuality {
  score: DataQualityLevel;
  numeric_score: number;
  reasons: string[];
  warnings: string[];
}

export interface NotCountedItem {
  item: string;
  reason: string;
}

export interface PilotRecommendation {
  recommended: boolean;
  recommended_workload_types: string[];
  recommended_regions: string[];
  excluded_workload_types: string[];
  excluded_priority_levels: Priority[];
  suggested_pilot_duration: string;
  suggested_success_metric: string;
  reason: string;
  risks_to_watch: string[];
}

export interface DiagnosticReport {
  generated_at: string;
  executive_summary: string;
  workload_flexibility_summary: string;
  estimated_savings_range: SavingsRange;
  estimated_carbon_impact: string;
  top_blockers: Array<{ reason: string; count: number }>;
  top_movable_workload_types: SavingsBreakdownRow[];
  top_pinned_workload_types: Array<{ workload_type: string; count: number }>;
  top_opportunities: WorkloadReportRow[];
  policy_constraints_applied: string[];
  assumptions_used: string[];
  data_quality: DataQuality;
  not_counted_savings: NotCountedItem[];
  recommended_pilot_scope: PilotRecommendation;
  recommended_next_step: string;
}

export interface SavingsBreakdownRow {
  key: string;
  workload_count: number;
  baseline_cost_usd: number;
  recommended_cost_usd: number;
  hard_savings_usd: number;
  baseline_carbon_g: number;
  recommended_carbon_g: number;
  carbon_delta_g: number;
}

export interface RetrospectiveReportAssumptions {
  gpu_kwh_assumption: number;
  gpu_kwh_assumption_source: 'default' | 'user';
  default_pue: number;
  cost_formula: string;
  carbon_formula: string;
  hard_savings_rule: string;
  delay_savings_rule: string;
  future_forecast_available: boolean;
}

export interface RetrospectiveReport {
  generated_at: string;
  raw_policy: Policy;
  assumptions: RetrospectiveReportAssumptions;
  workload_input_summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    by_priority: Record<Priority, number>;
    by_workload_type: Array<{ workload_type: string; count: number }>;
  };
  region_input_summary: {
    total_regions: number;
    total_gpu_available: number;
    by_grid_stress: Record<GridStress, number>;
    regions: Array<{
      region: string;
      gpu_available: number;
      electricity_price_per_kwh: number;
      carbon_intensity_g_per_kwh: number;
      grid_stress: GridStress;
      pue: number | null;
    }>;
  };
  summary: {
    total_workloads: number;
    valid_workloads: number;
    invalid_workloads: number;
    run_now_count: number;
    move_region_count: number;
    delay_count: number;
    manual_review_count: number;
    pinned_count: number;
    movable_count: number;
    movable_percent: number;
    pinned_percent: number;
    baseline_cost_usd: number;
    recommended_cost_usd: number;
    hard_savings_usd: number;
    hard_savings_percent: number;
    estimated_savings_usd: number;
    estimated_savings_percent: number;
    total_baseline_cost_usd: number;
    total_recommended_cost_usd: number;
    baseline_carbon_g: number;
    recommended_carbon_g: number;
    total_baseline_carbon_g: number;
    total_recommended_carbon_g: number;
    carbon_delta_g: number;
    carbon_delta_percent: number;
    average_confidence: number;
    policy_violation_count: number;
    capacity_blocked_count: number;
    latency_blocked_count: number;
    data_residency_blocked_count: number;
  };
  savings_range: SavingsRange;
  data_quality: DataQuality;
  pilot_recommendation: PilotRecommendation;
  not_counted_savings: NotCountedItem[];
  diagnostic: DiagnosticReport;
  breakdowns: {
    savings_by_workload_type: SavingsBreakdownRow[];
    savings_by_current_region: SavingsBreakdownRow[];
    savings_by_recommended_region: SavingsBreakdownRow[];
    recommendations_by_type: Record<RecommendationType, number>;
    recommendations_by_priority: Record<Priority, Record<RecommendationType, number>>;
    blocked_reasons_count: Array<{ reason: string; count: number }>;
    top_could_not_move_reasons: Array<{ reason: string; count: number }>;
    confidence_breakdown: Record<Confidence, number>;
    policy_violations: Array<{ workload_id: string; reason: string; blocked_reasons: string[] }>;
    top_savings_opportunities: WorkloadReportRow[];
    workloads_excluded_from_savings: WorkloadReportRow[];
  };
  aggregate_report_summary: RetrospectiveReport['summary'];
  recommendations: WorkloadReportRow[];
  rows: WorkloadReportRow[];
  validation_errors: ValidationError[];
}

export interface BuildRetrospectiveReportInput {
  workloads: Workload[];
  regions: Region[];
  policy: Policy;
  assumptions: Assumptions;
  validation_errors?: ValidationError[];
  invalid_rows?: InvalidRow[];
  generated_at?: string;
  future_forecast_available?: boolean;
}
