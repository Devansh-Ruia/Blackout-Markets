import type {
  BuildRetrospectiveReportInput,
  Confidence,
  EstimateAssumptions,
  InvalidRow,
  RecommendationType,
  Region,
  RetrospectiveReport,
  RetrospectiveReportAssumptions,
  SavingsBreakdownRow,
  Workload,
  WorkloadReportRow
} from './types';

const defaultPue = 1.2;

const stressWeight = {
  low: 0,
  medium: 0.08,
  high: 0.22
};

const recTypes: RecommendationType[] = ['run_now', 'delay', 'move_region', 'manual_review', 'pinned', 'invalid'];
const confidenceScore: Record<Confidence, number> = { high: 1, medium: 0.66, low: 0.33 };

function round(value: number, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function reportAssumptions(input: BuildRetrospectiveReportInput): RetrospectiveReportAssumptions {
  return {
    gpu_kwh_assumption: input.assumptions.gpu_kwh_assumption,
    gpu_kwh_assumption_source: input.assumptions.gpu_kwh_assumption_source,
    default_pue: input.assumptions.default_pue ?? defaultPue,
    cost_formula:
      'estimated_kwh = gpu_count * expected_duration_hours * gpu_kwh_assumption * pue; cost_usd = estimated_kwh * electricity_price_per_kwh',
    carbon_formula: 'carbon_g = estimated_kwh * carbon_intensity_g_per_kwh',
    hard_savings_rule:
      'Hard savings count only valid automatic move_region recommendations with concrete current and recommended energy data.',
    delay_savings_rule: 'Delay savings are not counted unless future forecast data is provided.',
    future_forecast_available: input.future_forecast_available ?? false
  };
}

function estimate(workload: Workload, region: Region, input: RetrospectiveReportAssumptions): EstimateAssumptions {
  const expected_duration_hours = workload.expected_duration_minutes / 60;
  const pue = region.pue ?? input.default_pue;
  const estimated_kwh = round(workload.gpu_count * expected_duration_hours * input.gpu_kwh_assumption * pue);

  return {
    region: region.region,
    gpu_count: workload.gpu_count,
    expected_duration_hours: round(expected_duration_hours),
    gpu_kwh_assumption: input.gpu_kwh_assumption,
    gpu_kwh_assumption_source: input.gpu_kwh_assumption_source,
    pue,
    pue_source: region.pue === undefined ? 'default' : 'region',
    electricity_price_per_kwh: region.electricity_price_per_kwh,
    carbon_intensity_g_per_kwh: region.carbon_intensity_g_per_kwh,
    estimated_kwh
  };
}

function costFrom(assumptions: EstimateAssumptions | null) {
  if (!assumptions) return { cost_usd: 0, carbon_g: 0 };
  return {
    cost_usd: round(assumptions.estimated_kwh * assumptions.electricity_price_per_kwh),
    carbon_g: round(assumptions.estimated_kwh * assumptions.carbon_intensity_g_per_kwh, 2)
  };
}

function effectiveAllowedRegions(workload: Workload, regions: Region[], blocked: string[], policyAllowed: string[]) {
  const regionNames = new Set(regions.map((region) => region.region));
  let allowed = new Set(policyAllowed.length > 0 ? policyAllowed : [...regionNames]);

  if (workload.allowed_regions && workload.allowed_regions.length > 0) {
    allowed = new Set([...allowed].filter((region) => workload.allowed_regions!.includes(region)));
  }

  if (workload.data_residency_region) {
    allowed = new Set([workload.data_residency_region]);
  }

  for (const region of blocked) {
    allowed.delete(region);
  }

  return allowed;
}

function latencyLimit(workload: Workload, maxLatency: number | null) {
  if (workload.latency_sensitive && workload.max_latency_ms !== undefined) return workload.max_latency_ms;
  return maxLatency;
}

function canDelayWithinDeadline(workload: Workload, maxDelayMinutes: number) {
  if (!workload.can_delay) return false;
  if (maxDelayMinutes <= 0) return false;
  if (workload.deadline_minutes_from_now === undefined) return true;
  return maxDelayMinutes + workload.expected_duration_minutes <= workload.deadline_minutes_from_now;
}

function scoreTarget(workload: Workload, region: Region, assumptions: RetrospectiveReportAssumptions) {
  const regionEstimate = estimate(workload, region, assumptions);
  const cost = costFrom(regionEstimate);
  const carbonPenalty = region.carbon_intensity_g_per_kwh / 1000;
  const reliabilityPenalty = (1 - (region.reliability_score ?? 0.95)) * 0.5;
  return cost.cost_usd + carbonPenalty + stressWeight[region.grid_stress] + reliabilityPenalty;
}

function confidenceFor(
  workload: Workload,
  current: Region,
  target: Region,
  savings: number,
  policyMaxLatency: number | null,
  assumptions: RetrospectiveReportAssumptions
): Confidence {
  let confidence: Confidence = 'high';

  if (target.grid_stress === 'medium') confidence = 'medium';
  if (target.grid_stress === 'high' || (target.reliability_score ?? 1) < 0.9) confidence = 'low';

  const baseline = costFrom(estimate(workload, current, assumptions));
  const savingsRatio = baseline.cost_usd > 0 ? savings / baseline.cost_usd : 0;
  if (savingsRatio < 0.08) confidence = confidence === 'high' ? 'medium' : 'low';

  const maxLatency = latencyLimit(workload, policyMaxLatency);
  if (
    maxLatency !== null &&
    maxLatency !== undefined &&
    target.avg_latency_ms !== undefined &&
    target.avg_latency_ms > maxLatency * 0.85
  ) {
    confidence = 'low';
  }

  return confidence;
}

function blocksForRegion(
  workload: Workload,
  region: Region,
  allowed: Set<string>,
  remainingCapacity: Map<string, number>,
  policy: BuildRetrospectiveReportInput['policy']
) {
  const blocks = new Set<string>();

  if (!allowed.has(region.region)) blocks.add('region_policy');

  if (
    policy.carbon_ceiling_g_per_kwh !== null &&
    region.carbon_intensity_g_per_kwh > policy.carbon_ceiling_g_per_kwh
  ) {
    blocks.add('carbon_ceiling');
  }

  const maxLatency = latencyLimit(workload, policy.max_latency_ms);
  if (maxLatency !== null && maxLatency !== undefined) {
    if (region.avg_latency_ms === undefined || region.avg_latency_ms > maxLatency) {
      blocks.add('latency');
    }
  } else if (workload.latency_sensitive && region.avg_latency_ms === undefined) {
    blocks.add('latency');
  }

  if ((remainingCapacity.get(region.region) ?? 0) < workload.gpu_count) {
    blocks.add('capacity');
  }

  return blocks;
}

function blockerSummary(
  workload: Workload,
  regions: Region[],
  allowed: Set<string>,
  remainingCapacity: Map<string, number>,
  policy: BuildRetrospectiveReportInput['policy']
) {
  const reasons = new Set<string>();

  for (const region of regions) {
    const blocks = blocksForRegion(workload, region, allowed, remainingCapacity, policy);
    for (const block of blocks) {
      reasons.add(block);
    }
  }

  if (allowed.size === 0) reasons.add('region_policy');
  if (workload.data_residency_region) reasons.add('data_residency');

  return [...reasons].sort();
}

function rankedTargets(
  workload: Workload,
  regions: Region[],
  allowed: Set<string>,
  remainingCapacity: Map<string, number>,
  policy: BuildRetrospectiveReportInput['policy'],
  assumptions: RetrospectiveReportAssumptions
) {
  return regions
    .filter((region) => blocksForRegion(workload, region, allowed, remainingCapacity, policy).size === 0)
    .sort((a, b) => {
      const scoreDelta = scoreTarget(workload, a, assumptions) - scoreTarget(workload, b, assumptions);
      return scoreDelta === 0 ? a.region.localeCompare(b.region) : scoreDelta;
    });
}

function rowFromParts(input: {
  workload: Workload;
  recommendation: RecommendationType;
  current: Region | null;
  target: Region | null;
  assumptions: RetrospectiveReportAssumptions;
  confidence: Confidence;
  reason: string;
  blocked_reasons: string[];
  counted: boolean;
  valid?: boolean;
}) {
  const baselineAssumptions = input.current ? estimate(input.workload, input.current, input.assumptions) : null;
  const recommendedAssumptions = input.target ? estimate(input.workload, input.target, input.assumptions) : baselineAssumptions;
  const baseline = costFrom(baselineAssumptions);
  const recommended = costFrom(recommendedAssumptions);
  const rawSavings = baseline.cost_usd - recommended.cost_usd;
  const counted = input.counted && rawSavings > 0;
  const hardSavings = counted ? round(rawSavings) : 0;
  const expectedHours = input.workload.expected_duration_minutes / 60;

  return {
    id: input.workload.id,
    customer_id: input.workload.customer_id,
    workload_type: input.workload.workload_type,
    gpu_type: input.workload.gpu_type,
    gpu_count: input.workload.gpu_count,
    expected_duration_minutes: input.workload.expected_duration_minutes,
    expected_duration_hours: round(expectedHours),
    current_region: input.workload.current_region,
    recommended_region: input.target?.region ?? input.current?.region ?? null,
    recommendation_type: input.recommendation,
    baseline_cost_usd: baseline.cost_usd,
    recommended_cost_usd: recommended.cost_usd,
    hard_savings_usd: hardSavings,
    baseline_carbon_g: baseline.carbon_g,
    recommended_carbon_g: recommended.carbon_g,
    carbon_delta_g: round(recommended.carbon_g - baseline.carbon_g, 2),
    confidence: input.confidence,
    reason: input.reason,
    blocked_reasons: Array.from(new Set(input.blocked_reasons)).sort(),
    counted_in_savings: counted,
    valid: input.valid ?? true,
    priority: input.workload.priority,
    assumptions: {
      baseline: baselineAssumptions,
      recommended: recommendedAssumptions,
      hard_savings_rule: input.assumptions.hard_savings_rule
    }
  } satisfies WorkloadReportRow;
}

function invalidWorkloadRow(row: InvalidRow, assumptions: RetrospectiveReportAssumptions): WorkloadReportRow {
  const id = row.id || `row-${row.row}`;
  return {
    id,
    workload_type: '',
    gpu_type: '',
    gpu_count: 0,
    expected_duration_minutes: 0,
    expected_duration_hours: 0,
    current_region: row.current_region ?? '',
    recommended_region: null,
    recommendation_type: 'invalid',
    baseline_cost_usd: 0,
    recommended_cost_usd: 0,
    hard_savings_usd: 0,
    baseline_carbon_g: 0,
    recommended_carbon_g: 0,
    carbon_delta_g: 0,
    confidence: 'low',
    reason: `Invalid workload row ${row.row}: ${row.reason}`,
    blocked_reasons: ['invalid'],
    counted_in_savings: false,
    valid: false,
    priority: row.priority ?? 'normal',
    assumptions: {
      baseline: null,
      recommended: null,
      hard_savings_rule: assumptions.hard_savings_rule
    }
  };
}

function invalidParsedWorkload(workload: Workload, reason: string, assumptions: RetrospectiveReportAssumptions): WorkloadReportRow {
  return rowFromParts({
    workload,
    recommendation: 'invalid',
    current: null,
    target: null,
    assumptions,
    confidence: 'low',
    reason,
    blocked_reasons: ['invalid'],
    counted: false,
    valid: false
  });
}

function delayRow(
  workload: Workload,
  current: Region,
  assumptions: RetrospectiveReportAssumptions,
  reason: string,
  blocked: string[]
) {
  return rowFromParts({
    workload,
    recommendation: 'delay',
    current,
    target: current,
    assumptions,
    confidence:
      workload.deadline_minutes_from_now !== undefined &&
      Math.min(workload.deadline_minutes_from_now, workload.expected_duration_minutes) > workload.deadline_minutes_from_now * 0.75
        ? 'low'
        : 'medium',
    reason: `${reason} This delay is not counted because no forecast data was provided.`,
    blocked_reasons: [...blocked, 'no_forecast'],
    counted: false
  });
}

function recommendationForWorkload(
  workload: Workload,
  regions: Region[],
  regionMap: Map<string, Region>,
  remainingCapacity: Map<string, number>,
  policy: BuildRetrospectiveReportInput['policy'],
  assumptions: RetrospectiveReportAssumptions
) {
  const current = regionMap.get(workload.current_region) ?? null;
  if (!current) {
    return invalidParsedWorkload(workload, `Current region ${workload.current_region} is missing from region data`, assumptions);
  }

  if (workload.data_residency_region && !regionMap.has(workload.data_residency_region)) {
    return invalidParsedWorkload(
      workload,
      `Data residency region ${workload.data_residency_region} is missing from region data`,
      assumptions
    );
  }

  if (workload.data_residency_region && workload.current_region !== workload.data_residency_region) {
    return invalidParsedWorkload(
      workload,
      `Current region ${workload.current_region} conflicts with data residency pin ${workload.data_residency_region}`,
      assumptions
    );
  }

  const allowed = effectiveAllowedRegions(workload, regions, policy.blocked_regions, policy.allowed_regions);
  const blocked = blockerSummary(workload, regions, allowed, remainingCapacity, policy);
  const currentCarbonBlocked =
    policy.carbon_ceiling_g_per_kwh !== null &&
    current.carbon_intensity_g_per_kwh > policy.carbon_ceiling_g_per_kwh;

  if (workload.data_residency_region) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy.max_delay_minutes)) {
      return delayRow(
        workload,
        current,
        assumptions,
        `Delay because ${current.region} is above the carbon ceiling and data residency pins this job to ${current.region}.`,
        blocked
      );
    }

    return rowFromParts({
      workload,
      recommendation: 'pinned',
      current,
      target: current,
      assumptions,
      confidence: 'high',
      reason: `This job cannot move because data residency pins it to ${workload.data_residency_region}.`,
      blocked_reasons: blocked,
      counted: false
    });
  }

  if (!workload.can_move) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy.max_delay_minutes)) {
      return delayRow(
        workload,
        current,
        assumptions,
        `Delay because ${current.region} is above the carbon ceiling and this job cannot move.`,
        blocked
      );
    }

    return rowFromParts({
      workload,
      recommendation: 'pinned',
      current,
      target: current,
      assumptions,
      confidence: 'high',
      reason: 'This job cannot move because can_move is false.',
      blocked_reasons: blocked,
      counted: false
    });
  }

  const candidates = rankedTargets(workload, regions, allowed, remainingCapacity, policy, assumptions);
  const target = candidates[0] ?? null;

  if (!target) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy.max_delay_minutes)) {
      return delayRow(
        workload,
        current,
        assumptions,
        'Delay because no approved region is below the carbon ceiling and the deadline leaves room to wait.',
        blocked
      );
    }

    return rowFromParts({
      workload,
      recommendation: 'manual_review',
      current,
      target: null,
      assumptions,
      confidence: 'low',
      reason: 'No approved region has enough GPU capacity while satisfying policy constraints.',
      blocked_reasons: blocked.length > 0 ? blocked : ['capacity'],
      counted: false
    });
  }

  const baseline = costFrom(estimate(workload, current, assumptions));
  const recommended = costFrom(estimate(workload, target, assumptions));
  const savings = baseline.cost_usd - recommended.cost_usd;
  const carbonDelta = recommended.carbon_g - baseline.carbon_g;
  const moving = target.region !== current.region;
  const confidence = confidenceFor(workload, current, target, savings, policy.max_latency_ms, assumptions);

  if (!moving) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy.max_delay_minutes)) {
      return delayRow(
        workload,
        current,
        assumptions,
        `Delay because ${current.region} is above the carbon ceiling and no better approved region is available.`,
        blocked
      );
    }

    if (workload.can_delay && current.grid_stress === 'high' && canDelayWithinDeadline(workload, policy.max_delay_minutes)) {
      return delayRow(
        workload,
        current,
        assumptions,
        `Delay because ${current.region} has high grid stress and no approved move improves the score.`,
        blocked
      );
    }

    const deadlineNote =
      workload.can_delay && workload.deadline_minutes_from_now !== undefined && policy.max_delay_minutes >= workload.deadline_minutes_from_now
        ? ' Delay was skipped because it would run past the workload deadline.'
        : '';
    const latencyNote = workload.latency_sensitive ? ' latency policy prevents approved moves above the workload limit.' : '';

    return rowFromParts({
      workload,
      recommendation: 'run_now',
      current,
      target: current,
      assumptions,
      confidence: 'high',
      reason: `Run now in ${current.region}; no approved move improves cost, carbon, capacity, and policy enough.${deadlineNote}${latencyNote}`,
      blocked_reasons: blocked,
      counted: false
    });
  }

  if (workload.priority === 'critical') {
    return rowFromParts({
      workload,
      recommendation: 'manual_review',
      current,
      target,
      assumptions,
      confidence: 'medium',
      reason: `Manual review because this critical workload could move to ${target.region}, but critical priority should not move automatically.`,
      blocked_reasons: blocked,
      counted: false
    });
  }

  if (target.grid_stress === 'high' && savings < baseline.cost_usd * 0.2 && carbonDelta >= 0) {
    return rowFromParts({
      workload,
      recommendation: 'manual_review',
      current,
      target,
      assumptions,
      confidence: 'low',
      reason: `Manual review because ${target.region} has high grid stress and the savings are not large enough to justify an automatic move.`,
      blocked_reasons: blocked,
      counted: false
    });
  }

  if (confidence === 'low' && policy.require_manual_for_low_confidence) {
    return rowFromParts({
      workload,
      recommendation: 'manual_review',
      current,
      target,
      assumptions,
      confidence,
      reason: `Manual review because the best move is low confidence even though ${target.region} has the best weighted score.`,
      blocked_reasons: blocked,
      counted: false
    });
  }

  const worse = savings <= 0 && carbonDelta >= 0;
  if (worse && candidates.some((region) => region.region === current.region)) {
    return rowFromParts({
      workload,
      recommendation: 'run_now',
      current,
      target: current,
      assumptions,
      confidence: 'high',
      reason: `Run now in ${current.region}; available moves do not reduce cost or carbon.`,
      blocked_reasons: blocked,
      counted: false
    });
  }

  return rowFromParts({
    workload,
    recommendation: 'move_region',
    current,
    target,
    assumptions,
    confidence,
    reason: `Move to ${target.region}; it has the best weighted score among approved regions with enough GPU capacity.`,
    blocked_reasons: blocked,
    counted: true
  });
}

function reserveCapacity(row: WorkloadReportRow, remainingCapacity: Map<string, number>) {
  if (!row.valid || row.recommended_region === null) return;
  if (!['move_region', 'run_now', 'pinned'].includes(row.recommendation_type)) return;
  const remaining = remainingCapacity.get(row.recommended_region);
  if (remaining === undefined) return;
  remainingCapacity.set(row.recommended_region, Math.max(0, remaining - row.gpu_count));
}

function countByType(rows: WorkloadReportRow[]) {
  return rows.reduce<Record<RecommendationType, number>>(
    (acc, row) => {
      acc[row.recommendation_type] += 1;
      return acc;
    },
    {
      run_now: 0,
      delay: 0,
      move_region: 0,
      manual_review: 0,
      pinned: 0,
      invalid: 0
    }
  );
}

function emptyBreakdown(key: string): SavingsBreakdownRow {
  return {
    key,
    workload_count: 0,
    baseline_cost_usd: 0,
    recommended_cost_usd: 0,
    hard_savings_usd: 0,
    baseline_carbon_g: 0,
    recommended_carbon_g: 0,
    carbon_delta_g: 0
  };
}

function savingsBreakdown(rows: WorkloadReportRow[], keyFor: (row: WorkloadReportRow) => string | null) {
  const groups = new Map<string, SavingsBreakdownRow>();

  for (const row of rows) {
    const key = keyFor(row);
    if (!key) continue;
    const group = groups.get(key) ?? emptyBreakdown(key);
    group.workload_count += 1;
    group.baseline_cost_usd += row.counted_in_savings ? row.baseline_cost_usd : 0;
    group.recommended_cost_usd += row.counted_in_savings ? row.recommended_cost_usd : 0;
    group.hard_savings_usd += row.hard_savings_usd;
    group.baseline_carbon_g += row.counted_in_savings ? row.baseline_carbon_g : 0;
    group.recommended_carbon_g += row.counted_in_savings ? row.recommended_carbon_g : 0;
    group.carbon_delta_g += row.counted_in_savings ? row.carbon_delta_g : 0;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      baseline_cost_usd: round(group.baseline_cost_usd),
      recommended_cost_usd: round(group.recommended_cost_usd),
      hard_savings_usd: round(group.hard_savings_usd),
      baseline_carbon_g: round(group.baseline_carbon_g, 2),
      recommended_carbon_g: round(group.recommended_carbon_g, 2),
      carbon_delta_g: round(group.carbon_delta_g, 2)
    }))
    .sort((a, b) => b.hard_savings_usd - a.hard_savings_usd || a.key.localeCompare(b.key));
}

function blockedReasonsCount(rows: WorkloadReportRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.blocked_reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function confidenceBreakdown(rows: WorkloadReportRow[]) {
  return rows.reduce<Record<Confidence, number>>(
    (acc, row) => {
      acc[row.confidence] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

function summary(rows: WorkloadReportRow[], workloads: Workload[]) {
  const validRows = rows.filter((row) => row.valid);
  const countedRows = validRows.filter((row) => row.counted_in_savings);
  const counts = countByType(rows);
  const baselineCost = validRows.reduce((sum, row) => sum + row.baseline_cost_usd, 0);
  const hardSavings = countedRows.reduce((sum, row) => sum + row.hard_savings_usd, 0);
  const countedBaselineCost = countedRows.reduce((sum, row) => sum + row.baseline_cost_usd, 0);
  const countedBaselineCarbon = countedRows.reduce((sum, row) => sum + row.baseline_carbon_g, 0);
  const baselineCarbon = validRows.reduce((sum, row) => sum + row.baseline_carbon_g, 0);
  const recommendedCarbon = validRows.reduce(
    (sum, row) => sum + (row.counted_in_savings ? row.recommended_carbon_g : row.baseline_carbon_g),
    0
  );
  const movableCount = workloads.filter((workload) => workload.can_move && !workload.data_residency_region).length;
  const policyReasons = new Set(['region_policy', 'carbon_ceiling', 'latency', 'data_residency']);
  const policyViolationCount = rows.filter((row) => row.blocked_reasons.some((reason) => policyReasons.has(reason))).length;
  const confidenceTotal = rows.reduce((sum, row) => sum + confidenceScore[row.confidence], 0);

  return {
    total_workloads: rows.length,
    valid_workloads: validRows.length,
    invalid_workloads: counts.invalid,
    run_now_count: counts.run_now,
    move_region_count: counts.move_region,
    delay_count: counts.delay,
    manual_review_count: counts.manual_review,
    pinned_count: counts.pinned,
    movable_count: movableCount,
    movable_percent: validRows.length > 0 ? round((movableCount / validRows.length) * 100) : 0,
    pinned_percent: validRows.length > 0 ? round((counts.pinned / validRows.length) * 100) : 0,
    baseline_cost_usd: round(baselineCost),
    recommended_cost_usd: round(baselineCost - hardSavings),
    hard_savings_usd: round(hardSavings),
    hard_savings_percent: countedBaselineCost > 0 ? round((hardSavings / countedBaselineCost) * 100) : 0,
    baseline_carbon_g: round(baselineCarbon, 2),
    recommended_carbon_g: round(recommendedCarbon, 2),
    carbon_delta_g: round(recommendedCarbon - baselineCarbon, 2),
    carbon_delta_percent: countedBaselineCarbon > 0 ? round(((recommendedCarbon - baselineCarbon) / countedBaselineCarbon) * 100) : 0,
    average_confidence: rows.length > 0 ? round(confidenceTotal / rows.length, 4) : 0,
    policy_violation_count: policyViolationCount,
    capacity_blocked_count: rows.filter((row) => row.blocked_reasons.includes('capacity')).length,
    latency_blocked_count: rows.filter((row) => row.blocked_reasons.includes('latency')).length,
    data_residency_blocked_count: rows.filter((row) => row.blocked_reasons.includes('data_residency')).length
  };
}

export function buildRetrospectiveReport(input: BuildRetrospectiveReportInput): RetrospectiveReport {
  const assumptions = reportAssumptions(input);
  const regionMap = new Map(input.regions.map((region) => [region.region, region]));
  const remainingCapacity = new Map(input.regions.map((region) => [region.region, region.gpu_available]));
  const rows: WorkloadReportRow[] = [];
  const seenIds = new Set<string>();

  for (const invalidRow of input.invalid_rows ?? []) {
    rows.push(invalidWorkloadRow(invalidRow, assumptions));
  }

  for (const workload of input.workloads) {
    if (seenIds.has(workload.id)) {
      rows.push(invalidParsedWorkload(workload, `Duplicate workload ID ${workload.id}`, assumptions));
      continue;
    }

    seenIds.add(workload.id);
    const row = recommendationForWorkload(
      workload,
      input.regions,
      regionMap,
      remainingCapacity,
      input.policy,
      assumptions
    );
    rows.push(row);
    reserveCapacity(row, remainingCapacity);
  }

  const reportSummary = summary(rows, input.workloads);
  const recommendationsByType = countByType(rows);
  const policyReasons = new Set(['region_policy', 'carbon_ceiling', 'latency', 'data_residency']);

  return {
    generated_at: input.generated_at ?? new Date().toISOString(),
    assumptions,
    summary: reportSummary,
    breakdowns: {
      savings_by_workload_type: savingsBreakdown(rows, (row) => (row.valid ? row.workload_type : null)),
      savings_by_current_region: savingsBreakdown(rows, (row) => (row.valid ? row.current_region : null)),
      savings_by_recommended_region: savingsBreakdown(rows, (row) =>
        row.valid && row.recommended_region ? row.recommended_region : null
      ),
      recommendations_by_type: recommendationsByType,
      blocked_reasons_count: blockedReasonsCount(rows),
      confidence_breakdown: confidenceBreakdown(rows),
      policy_violations: rows
        .filter((row) => row.blocked_reasons.some((reason) => policyReasons.has(reason)))
        .map((row) => ({ workload_id: row.id, reason: row.reason, blocked_reasons: row.blocked_reasons })),
      top_savings_opportunities: rows
        .filter((row) => row.counted_in_savings && row.hard_savings_usd > 0)
        .sort((a, b) => b.hard_savings_usd - a.hard_savings_usd || a.id.localeCompare(b.id))
        .slice(0, 10),
      workloads_excluded_from_savings: rows.filter((row) => !row.counted_in_savings)
    },
    rows,
    validation_errors: input.validation_errors ?? []
  };
}
