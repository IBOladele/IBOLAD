export type ThresholdRule<TStep = unknown> = {
  id: string;
  min_amount_minor: bigint | null;
  max_amount_minor: bigint | null;
  steps: TStep[];
};

export function amountMatchesThreshold(
  amountMinor: bigint,
  minAmountMinor: bigint | null,
  maxAmountMinor: bigint | null,
): boolean {
  const minMatches = minAmountMinor === null || amountMinor >= minAmountMinor;
  const maxMatches = maxAmountMinor === null || amountMinor <= maxAmountMinor;
  return minMatches && maxMatches;
}

export function selectThresholdRule<TStep>(
  rules: ThresholdRule<TStep>[],
  amountMinor: bigint,
): ThresholdRule<TStep> | null {
  const sortedRules = [...rules].sort((left, right) => {
    const leftMin = left.min_amount_minor ?? -1n;
    const rightMin = right.min_amount_minor ?? -1n;
    if (leftMin !== rightMin) {
      return leftMin < rightMin ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });

  for (const rule of sortedRules) {
    if (amountMatchesThreshold(amountMinor, rule.min_amount_minor, rule.max_amount_minor)) {
      return rule;
    }
  }

  return null;
}

export function violatesSeparationOfDuties(
  createdByUserId: string | null,
  actingUserId: string,
): boolean {
  return createdByUserId !== null && createdByUserId === actingUserId;
}
