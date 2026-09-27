/**
 * Divides non-negative integers and rounds to the nearest integer, with ties rounded up.
 * The numerator must be non-negative and the denominator must be positive.
 * This helper preserves the caller's scale; it does not convert decimal places.
 */
export function roundNonNegativeDivision(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError('Expected a non-negative numerator and a positive denominator.');
  }

  // Adding half the divisor compensates for BigInt division truncating the fraction.
  return (numerator + denominator / 2n) / denominator;
}
