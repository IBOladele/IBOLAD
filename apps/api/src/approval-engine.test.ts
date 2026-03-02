import { describe, expect, it } from 'vitest';
import {
  amountMatchesThreshold,
  selectThresholdRule,
  violatesSeparationOfDuties,
} from './approval-engine.js';

describe('approval-engine helpers', () => {
  it('matches threshold ranges correctly', () => {
    expect(amountMatchesThreshold(500_000n, null, 1_000_000n)).toBe(true);
    expect(amountMatchesThreshold(1_500_000n, 1_000_001n, null)).toBe(true);
    expect(amountMatchesThreshold(1_500_000n, null, 1_000_000n)).toBe(false);
  });

  it('selects threshold rule based on base amount', () => {
    const rules = [
      {
        id: 'rule-low',
        min_amount_minor: null,
        max_amount_minor: 1_000_000n,
        steps: [{ step_order: 1, role_code: 'DEPT_HEAD' }],
      },
      {
        id: 'rule-high',
        min_amount_minor: 1_000_001n,
        max_amount_minor: null,
        steps: [
          { step_order: 1, role_code: 'DEPT_HEAD' },
          { step_order: 2, role_code: 'FINANCE' },
        ],
      },
    ];

    const selectedLow = selectThresholdRule(rules, 900_000n);
    expect(selectedLow?.id).toBe('rule-low');
    expect(selectedLow?.steps.length).toBe(1);

    const selectedHigh = selectThresholdRule(rules, 1_250_000n);
    expect(selectedHigh?.id).toBe('rule-high');
    expect(selectedHigh?.steps.length).toBe(2);
  });

  it('enforces separation-of-duties', () => {
    expect(
      violatesSeparationOfDuties('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'),
    ).toBe(true);
    expect(
      violatesSeparationOfDuties('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
    ).toBe(false);
  });
});
