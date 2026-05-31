import type {
  Assumptions,
  Confidence,
  CostEstimate,
  OptimizationReport,
  Policy,
  Recommendation,
  Region,
  ValidationError,
  Workload
} from './types';

const stressWeight = {
  low: 0,
  medium: 0.08,
  high: 0.22
};

const priorityRank: Record<Workload['priority'], number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3
};

function round(value: number, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function estimateCost(workload: Workload, region: Region, assumptions: Assumptions): CostEstimate {
  const hours = workload.expected_duration_minutes / 60;
  const pue = region.pue ?? assumptions.default_pue ?? 1.2;
  const estimated_kwh = workload.gpu_count * hours * assumptions.gpu_kwh_assumption * pue;
  return {
    estimated_kwh: round(estimated_kwh),
    cost_usd: round(estimated_kwh * region.electricity_price_per_kwh),
    carbon_g: round(estimated_kwh * region.carbon_intensity_g_per_kwh, 2)
  };
}

function makeRecommendation(
  workload: Workload,
  recommendation: Recommendation['recommendation'],
  current: Region,
  target: Region,
  assumptions: Assumptions,
  options: {
    delay_minutes?: number;
    confidence?: Confidence;
    reason: string;
    policy_reason: string;
    valid?: boolean;
  }
): Recommendation {
  const baseline = estimateCost(workload, current, assumptions);
  const recommended = estimateCost(workload, target, assumptions);
  const delay = options.delay_minutes ?? 0;

  return {
    workload_id: workload.id,
    recommendation,
    current_region: workload.current_region,
    recommended_region: target.region,
    delay_minutes: delay,
    baseline_cost_usd: baseline.cost_usd,
    recommended_cost_usd: recommended.cost_usd,
    estimated_savings_usd: round(baseline.cost_usd - recommended.cost_usd),
    baseline_carbon_g: baseline.carbon_g,
    recommended_carbon_g: recommended.carbon_g,
    carbon_delta_g: round(recommended.carbon_g - baseline.carbon_g, 2),
    delay_impact: delay > 0 ? `Delay ${delay} minutes within policy window` : 'No delay',
    policy_reason: options.policy_reason,
    confidence: options.confidence ?? 'high',
    reason: options.reason,
    valid: options.valid ?? true,
    priority: workload.priority,
    capacity_checked: options.valid ?? true,
    capacity_reserved: 0,
    remaining_region_capacity_after_assignment: null,
    capacity_reason: null
  };
}

export function invalidInputRecommendation(input: {
  id?: string;
  current_region?: string;
  priority?: Workload['priority'];
  reason: string;
}): Recommendation {
  return {
    workload_id: input.id || `row-error`,
    recommendation: 'invalid',
    current_region: input.current_region || '',
    recommended_region: input.current_region || '',
    delay_minutes: 0,
    baseline_cost_usd: 0,
    recommended_cost_usd: 0,
    estimated_savings_usd: 0,
    baseline_carbon_g: 0,
    recommended_carbon_g: 0,
    carbon_delta_g: 0,
    delay_impact: 'No delay',
    policy_reason: input.reason,
    confidence: 'low',
    reason: input.reason,
    valid: false,
    priority: input.priority ?? 'normal',
    capacity_checked: false,
    capacity_reserved: 0,
    remaining_region_capacity_after_assignment: null,
    capacity_reason: null
  };
}

function invalidRecommendation(workload: Workload, reason: string): Recommendation {
  return invalidInputRecommendation({
    id: workload.id,
    current_region: workload.current_region,
    priority: workload.priority,
    reason
  });
}

function effectiveAllowedRegions(workload: Workload, regions: Region[], policy: Policy) {
  const all = new Set(regions.map((region) => region.region));
  let allowed = new Set(policy.allowed_regions.length > 0 ? policy.allowed_regions : [...all]);

  if (workload.allowed_regions && workload.allowed_regions.length > 0) {
    allowed = new Set([...allowed].filter((region) => workload.allowed_regions!.includes(region)));
  }

  if (workload.data_residency_region) {
    allowed = new Set([workload.data_residency_region]);
  }

  for (const blocked of policy.blocked_regions) {
    allowed.delete(blocked);
  }

  return allowed;
}

function latencyLimit(workload: Workload, policy: Policy) {
  if (workload.latency_sensitive && workload.max_latency_ms !== undefined) return workload.max_latency_ms;
  return policy.max_latency_ms;
}

function targetIsValid(
  workload: Workload,
  region: Region,
  allowed: Set<string>,
  policy: Policy,
  remainingCapacity: Map<string, number>
) {
  if (!allowed.has(region.region)) return false;
  if ((remainingCapacity.get(region.region) ?? region.gpu_available) < workload.gpu_count) return false;
  if (policy.carbon_ceiling_g_per_kwh !== null && region.carbon_intensity_g_per_kwh > policy.carbon_ceiling_g_per_kwh) {
    return false;
  }

  const maxLatency = latencyLimit(workload, policy);
  if (maxLatency !== null && maxLatency !== undefined && region.avg_latency_ms !== undefined && region.avg_latency_ms > maxLatency) {
    return false;
  }

  return true;
}

function targetIsValidExceptCapacity(workload: Workload, region: Region, allowed: Set<string>, policy: Policy) {
  if (!allowed.has(region.region)) return false;
  if (policy.carbon_ceiling_g_per_kwh !== null && region.carbon_intensity_g_per_kwh > policy.carbon_ceiling_g_per_kwh) {
    return false;
  }

  const maxLatency = latencyLimit(workload, policy);
  if (maxLatency !== null && maxLatency !== undefined && region.avg_latency_ms !== undefined && region.avg_latency_ms > maxLatency) {
    return false;
  }

  return true;
}

function capacityReasonFor(
  workload: Workload,
  regions: Region[],
  allowed: Set<string>,
  policy: Policy,
  remainingCapacity: Map<string, number>
) {
  const blockedMove = regions.find(
    (region) =>
      region.region !== workload.current_region &&
      targetIsValidExceptCapacity(workload, region, allowed, policy) &&
      (remainingCapacity.get(region.region) ?? region.gpu_available) < workload.gpu_count
  );

  if (blockedMove) {
    return `Cannot move because ${blockedMove.region} does not have enough remaining GPU capacity.`;
  }

  const current = regions.find((region) => region.region === workload.current_region);
  if (
    current &&
    targetIsValidExceptCapacity(workload, current, allowed, policy) &&
    (remainingCapacity.get(current.region) ?? current.gpu_available) < workload.gpu_count
  ) {
    return `Cannot run in ${current.region} because it does not have enough remaining GPU capacity.`;
  }

  return null;
}

function scoreTarget(workload: Workload, region: Region, assumptions: Assumptions) {
  const estimate = estimateCost(workload, region, assumptions);
  const carbonPenalty = region.carbon_intensity_g_per_kwh / 1000;
  const reliabilityPenalty = (1 - (region.reliability_score ?? 0.95)) * 0.5;
  return estimate.cost_usd + carbonPenalty + stressWeight[region.grid_stress] + reliabilityPenalty;
}

function confidenceFor(
  workload: Workload,
  current: Region,
  target: Region,
  savings: number,
  policy: Policy,
  assumptions: Assumptions
): Confidence {
  let confidence: Confidence = 'high';

  if (target.grid_stress === 'medium') confidence = 'medium';
  if (target.grid_stress === 'high' || (target.reliability_score ?? 1) < 0.9) confidence = 'low';

  const baseline = estimateCost(workload, current, assumptions);
  const savingsRatio = baseline.cost_usd > 0 ? savings / baseline.cost_usd : 0;
  if (savingsRatio < 0.08) confidence = confidence === 'high' ? 'medium' : 'low';

  const maxLatency = latencyLimit(workload, policy);
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

function bestTarget(
  workload: Workload,
  regions: Region[],
  allowed: Set<string>,
  policy: Policy,
  assumptions: Assumptions,
  remainingCapacity: Map<string, number>
) {
  const capacity_reason = capacityReasonFor(workload, regions, allowed, policy, remainingCapacity);
  const candidates = regions.filter((region) => targetIsValid(workload, region, allowed, policy, remainingCapacity));
  const ranked = [...candidates].sort((a, b) => {
    const scoreDelta = scoreTarget(workload, a, assumptions) - scoreTarget(workload, b, assumptions);
    return scoreDelta === 0 ? a.region.localeCompare(b.region) : scoreDelta;
  });
  const target = ranked[0] ?? null;

  return { target, candidates, capacity_reason };
}

function canDelayWithinDeadline(workload: Workload, policy: Policy) {
  if (!workload.can_delay) return false;
  if (policy.max_delay_minutes <= 0) return false;
  if (workload.deadline_minutes_from_now === undefined) return true;
  return policy.max_delay_minutes + workload.expected_duration_minutes <= workload.deadline_minutes_from_now;
}

function delayRecommendation(workload: Workload, current: Region, assumptions: Assumptions, policy: Policy, reason: string) {
  const latestStart =
    workload.deadline_minutes_from_now === undefined
      ? policy.max_delay_minutes
      : Math.max(0, workload.deadline_minutes_from_now - workload.expected_duration_minutes);
  const delay = Math.min(policy.max_delay_minutes, latestStart);
  return makeRecommendation(workload, 'delay', current, current, assumptions, {
    delay_minutes: delay,
    confidence: workload.deadline_minutes_from_now !== undefined && delay > workload.deadline_minutes_from_now * 0.75 ? 'low' : 'medium',
    reason,
    policy_reason: 'Delay stays within policy and workload deadline'
  });
}

function cannotDelayReason(workload: Workload, policy: Policy) {
  if (!workload.can_delay) return 'Cannot delay because can_delay is false.';
  if (policy.max_delay_minutes <= 0) return 'Cannot delay because policy max_delay_minutes is 0.';
  if (
    workload.deadline_minutes_from_now !== undefined &&
    policy.max_delay_minutes + workload.expected_duration_minutes > workload.deadline_minutes_from_now
  ) {
    return 'Cannot delay because deadline would be missed.';
  }
  return null;
}

function currentCapacityReason(workload: Workload, current: Region, remainingCapacity: Map<string, number>) {
  const remaining = remainingCapacity.get(current.region) ?? current.gpu_available;
  if (remaining >= workload.gpu_count) return null;
  return `Cannot run in ${current.region} because it does not have enough remaining GPU capacity.`;
}

function markCapacityReason(result: Recommendation, reason: string | null) {
  result.capacity_reason = reason;
  return result;
}

function moveReason(current: Region, target: Region, savings: number, carbonDelta: number) {
  if (savings > 0 && carbonDelta < 0) {
    return `Moved from ${current.region} to ${target.region} because estimated energy cost and carbon are lower and policy allows it.`;
  }
  if (savings > 0) {
    return `Moved from ${current.region} to ${target.region} because estimated energy cost is lower and policy allows it.`;
  }
  if (carbonDelta < 0) {
    return `Moved from ${current.region} to ${target.region} because estimated carbon is lower and policy allows it.`;
  }
  return `Moved from ${current.region} to ${target.region} because policy allows it and the current region is not the best safe target.`;
}

function reserveCapacity(result: Recommendation, workload: Workload, remainingCapacity: Map<string, number>) {
  if (!result.valid) return result;
  if (!['move_region', 'run_now', 'pinned'].includes(result.recommendation)) return result;

  const remaining = remainingCapacity.get(result.recommended_region);
  if (remaining === undefined) return result;

  if (remaining < workload.gpu_count) {
    result.capacity_reserved = 0;
    result.remaining_region_capacity_after_assignment = remaining;
    result.capacity_reason = `Cannot run in ${result.recommended_region} because it does not have enough remaining GPU capacity.`;
    return result;
  }

  const next = remaining - workload.gpu_count;
  remainingCapacity.set(result.recommended_region, next);
  result.capacity_reserved = workload.gpu_count;
  result.remaining_region_capacity_after_assignment = next;
  return result;
}

function optimizeOne(
  workload: Workload,
  regions: Region[],
  policy: Policy,
  assumptions: Assumptions,
  remainingCapacity: Map<string, number>
): Recommendation {
  const current = regions.find((region) => region.region === workload.current_region);
  if (!current) {
    return invalidRecommendation(workload, `Invalid because current_region ${workload.current_region} is missing from region data.`);
  }

  if (workload.data_residency_region && !regions.some((region) => region.region === workload.data_residency_region)) {
    return invalidRecommendation(workload, `Data residency region ${workload.data_residency_region} is missing from region data`);
  }

  if (workload.data_residency_region && workload.current_region !== workload.data_residency_region) {
    return invalidRecommendation(
      workload,
      `Current region ${workload.current_region} conflicts with data residency pin ${workload.data_residency_region}`
    );
  }

  const allowed = effectiveAllowedRegions(workload, regions, policy);
  const currentCapacity = currentCapacityReason(workload, current, remainingCapacity);
  const currentCarbonBlocked =
    policy.carbon_ceiling_g_per_kwh !== null &&
    current.carbon_intensity_g_per_kwh > policy.carbon_ceiling_g_per_kwh;

  if (workload.data_residency_region) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy)) {
      return delayRecommendation(
        workload,
        current,
        assumptions,
        policy,
        `Delay because ${current.region} is above the carbon ceiling and data residency pins this job to ${current.region}.`
      );
    }

    if (!allowed.has(current.region)) {
      return makeRecommendation(workload, 'manual_review', current, current, assumptions, {
        confidence: 'low',
        reason: `Manual review because policy blocks ${current.region}, but data residency pins this job there.`,
        policy_reason: 'Policy conflicts with data residency pin'
      });
    }

    if (currentCapacity) {
      return markCapacityReason(
        makeRecommendation(workload, 'manual_review', current, current, assumptions, {
          confidence: 'low',
          reason: `Manual review because ${currentCapacity}`,
          policy_reason: 'Pinned region is out of remaining batch capacity'
        }),
        currentCapacity
      );
    }

    return makeRecommendation(workload, 'pinned', current, current, assumptions, {
      reason: `Pinned because data residency pins it to ${workload.data_residency_region}.`,
      policy_reason: 'Data residency pin'
    });
  }

  if (!workload.can_move) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy)) {
      return delayRecommendation(
        workload,
        current,
        assumptions,
        policy,
        `Delay because ${current.region} is above the carbon ceiling and this job cannot move.`
      );
    }

    if (!allowed.has(current.region)) {
      return makeRecommendation(workload, 'manual_review', current, current, assumptions, {
        confidence: 'low',
        reason: `Manual review because policy blocks ${current.region}, but can_move is false.`,
        policy_reason: 'Policy conflicts with movement pin'
      });
    }

    if (currentCapacity) {
      return markCapacityReason(
        makeRecommendation(workload, 'manual_review', current, current, assumptions, {
          confidence: 'low',
          reason: `Manual review because ${currentCapacity}`,
          policy_reason: 'Pinned workload is out of remaining batch capacity'
        }),
        currentCapacity
      );
    }

    return makeRecommendation(workload, 'pinned', current, current, assumptions, {
      reason: 'Pinned because can_move is false; workload cannot move.',
      policy_reason: 'Movement disabled by workload'
    });
  }

  const { target, candidates, capacity_reason } = bestTarget(workload, regions, allowed, policy, assumptions, remainingCapacity);

  if (!target) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy)) {
      return delayRecommendation(
        workload,
        current,
        assumptions,
        policy,
        `Delay because no approved region is below the carbon ceiling and the deadline leaves room to wait.`
      );
    }

    return markCapacityReason(
      makeRecommendation(workload, 'manual_review', current, current, assumptions, {
        confidence: 'low',
        reason: capacity_reason ?? 'Manual review because no approved region satisfies capacity, latency, residency, carbon, and region policy.',
        policy_reason: 'No valid target region'
      }),
      capacity_reason
    );
  }

  const baseline = estimateCost(workload, current, assumptions);
  const recommended = estimateCost(workload, target, assumptions);
  const savings = baseline.cost_usd - recommended.cost_usd;
  const carbonDelta = recommended.carbon_g - baseline.carbon_g;
  const moving = target.region !== current.region;
  const confidence = confidenceFor(workload, current, target, savings, policy, assumptions);

  if (!moving) {
    if (currentCarbonBlocked && canDelayWithinDeadline(workload, policy)) {
      return delayRecommendation(
        workload,
        current,
        assumptions,
        policy,
        `Delay because ${current.region} is above the carbon ceiling and no better approved region is available.`
      );
    }

    if (workload.can_delay && current.grid_stress === 'high' && canDelayWithinDeadline(workload, policy)) {
      return delayRecommendation(
        workload,
        current,
        assumptions,
        policy,
        `Delay because ${current.region} has high grid stress and no approved move improves the score.`
      );
    }

    const deadlineNote = cannotDelayReason(workload, policy);
    const latencyNote = workload.latency_sensitive ? ' latency policy prevents approved moves above the workload limit.' : '';
    const capacityNote = capacity_reason ? ` ${capacity_reason}` : '';

    return markCapacityReason(
      makeRecommendation(workload, 'run_now', current, current, assumptions, {
        reason: `Run now in ${current.region}; no approved move improves estimated cost, carbon, capacity, and policy enough.${
          deadlineNote ? ` ${deadlineNote}` : ''
        }${latencyNote}${capacityNote}`,
        policy_reason: 'Current region is the best valid option'
      }),
      capacity_reason
    );
  }

  if (workload.priority === 'critical') {
    return markCapacityReason(
      makeRecommendation(workload, 'manual_review', current, target, assumptions, {
        confidence: 'medium',
        reason: `Manual review because this critical workload could move to ${target.region}, but critical priority should not move automatically.${
          capacity_reason ? ` ${capacity_reason}` : ''
        }`,
        policy_reason: 'Critical priority requires operator review'
      }),
      capacity_reason
    );
  }

  if (target.grid_stress === 'high' && savings < baseline.cost_usd * 0.2 && carbonDelta >= 0) {
    return markCapacityReason(
      makeRecommendation(workload, 'manual_review', current, target, assumptions, {
        confidence: 'low',
        reason: `Manual review because ${target.region} has high grid stress and the savings are not large enough to justify an automatic move.${
          capacity_reason ? ` ${capacity_reason}` : ''
        }`,
        policy_reason: 'High grid stress target'
      }),
      capacity_reason
    );
  }

  if (confidence === 'low' && policy.require_manual_for_low_confidence) {
    return markCapacityReason(
      makeRecommendation(workload, 'manual_review', current, target, assumptions, {
        confidence,
        reason: `Manual review because the target ${target.region} is low confidence after grid stress, latency, and reliability checks.${
          capacity_reason ? ` ${capacity_reason}` : ''
        }`,
        policy_reason: 'Low confidence move requires approval'
      }),
      capacity_reason
    );
  }

  const worse = savings <= 0 && carbonDelta >= 0;
  if (worse && candidates.some((region) => region.region === current.region)) {
    return markCapacityReason(
      makeRecommendation(workload, 'run_now', current, current, assumptions, {
        reason: `Run now in ${current.region}; available moves do not reduce estimated cost or carbon.${
          capacity_reason ? ` ${capacity_reason}` : ''
        }`,
        policy_reason: 'No beneficial approved move'
      }),
      capacity_reason
    );
  }

  return markCapacityReason(
    makeRecommendation(workload, 'move_region', current, target, assumptions, {
      confidence,
      reason: `${moveReason(current, target, savings, carbonDelta)}${capacity_reason ? ` ${capacity_reason}` : ''}`,
      policy_reason: 'Approved move satisfies capacity, latency, residency, carbon, and region policy'
    }),
    capacity_reason
  );
}

function priorityOrdered(workloads: Workload[]) {
  return workloads
    .map((workload, index) => ({ workload, index }))
    .sort((a, b) => priorityRank[a.workload.priority] - priorityRank[b.workload.priority] || a.index - b.index)
    .map((item) => item.workload);
}

export function optimize(
  workloads: Workload[],
  regions: Region[],
  policy: Policy,
  assumptions: Assumptions,
  validation_errors: ValidationError[] = [],
  extraRecommendations: Recommendation[] = []
): OptimizationReport {
  const remainingCapacity = new Map(regions.map((region) => [region.region, region.gpu_available]));
  const recommendations = [
    ...extraRecommendations,
    ...priorityOrdered(workloads).map((workload) =>
      reserveCapacity(optimizeOne(workload, regions, policy, assumptions, remainingCapacity), workload, remainingCapacity)
    )
  ];

  const summary = recommendations.reduce(
    (acc, result) => {
      acc.total_workloads += 1;
      if (result.recommendation === 'move_region') acc.workloads_movable += 1;
      if (result.recommendation === 'delay') acc.workloads_delayed += 1;
      if (result.recommendation === 'pinned') acc.workloads_pinned += 1;
      if (result.recommendation === 'invalid') acc.invalid_workloads += 1;
      acc.estimated_total_savings_usd += result.estimated_savings_usd;
      acc.estimated_carbon_delta_g += result.carbon_delta_g;
      return acc;
    },
    {
      total_workloads: 0,
      workloads_movable: 0,
      workloads_delayed: 0,
      workloads_pinned: 0,
      invalid_workloads: 0,
      estimated_total_savings_usd: 0,
      estimated_carbon_delta_g: 0
    }
  );

  return {
    generated_at: new Date().toISOString(),
    assumptions,
    summary: {
      ...summary,
      estimated_total_savings_usd: round(summary.estimated_total_savings_usd),
      estimated_carbon_delta_g: round(summary.estimated_carbon_delta_g, 2)
    },
    recommendations,
    validation_errors
  };
}
