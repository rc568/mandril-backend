import { roundNonNegativeDivision } from '@/shared/utils/round-non-negative-division';

const SCALE = 1_000_000n;

export function amountToScaledInteger(value: string | number): bigint {
  const decimalValue = typeof value === 'number' ? value.toString() : value;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(decimalValue);
  if (!match) throw new RangeError('Expected a non-negative decimal amount.');

  const [, whole, fraction = '', exponentValue = '0'] = match;
  const digits = BigInt(`${whole}${fraction}`);
  const scaleShift = 6 - fraction.length + Number(exponentValue);
  if (scaleShift >= 0) return digits * 10n ** BigInt(scaleShift);

  const divisor = 10n ** BigInt(-scaleShift);
  // Round half up once when reducing the input to the database's six decimal places.
  return roundNonNegativeDivision(digits, divisor);
}

export function formatScaledAmount(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absoluteValue = value < 0n ? -value : value;
  return `${sign}${absoluteValue / SCALE}.${(absoluteValue % SCALE).toString().padStart(6, '0')}`;
}
