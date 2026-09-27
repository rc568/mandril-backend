import { describe, expect, it } from 'vitest';
import { roundNonNegativeDivision } from '@/shared/utils/round-non-negative-division';

describe('roundNonNegativeDivision', () => {
  it.each([
    [0n, 3n, 0n],
    [12n, 3n, 4n],
    [14n, 10n, 1n],
    [15n, 10n, 2n],
    [16n, 10n, 2n],
    [1n, 3n, 0n],
    [2n, 3n, 1n],
    [7n, 1n, 7n],
  ])('rounds %s / %s to %s', (numerator, denominator, expected) => {
    expect(roundNonNegativeDivision(numerator, denominator)).toBe(expected);
  });

  it('preserves exact integers beyond Number precision', () => {
    expect(roundNonNegativeDivision(18014398509481987n, 2n)).toBe(9007199254740994n);
  });

  it.each([
    [-1n, 2n],
    [1n, -2n],
    [-1n, -2n],
    [1n, 0n],
    [0n, 0n],
  ])('rejects unsupported operands %s / %s', (numerator, denominator) => {
    expect(() => roundNonNegativeDivision(numerator, denominator)).toThrow(RangeError);
  });
});
