import { CustomError, errorMessages } from '@/shared/domain';
import { roundNonNegativeDivision } from '@/shared/utils/round-non-negative-division';

interface ReceiptCost {
  availableQuantity: number;
  defectiveQuantity: number;
  unitCostPen: string | null;
}

interface WeightedPurchasePriceInput {
  currentPurchasePrice: string;
  currentAvailableQuantity: number;
  currentReservedQuantity: number;
  receiptItems: readonly ReceiptCost[];
}

const SCALE = 1_000_000n;

function scaledCost(value: string | null): bigint {
  if (value === null) throw CustomError.badRequest(errorMessages.inventory.finalCostRequired);
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(value)) {
    throw CustomError.badRequest(errorMessages.inventory.invalidCost);
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}

function quantity(value: number): bigint {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw CustomError.badRequest(errorMessages.inventory.invalidQuantity);
  }
  return BigInt(value);
}

// All receipt items must belong to the same variant and the same posting operation.
// Existing defective/quarantined units are intentionally absent from the inputs.
export function calculateWeightedPurchasePrice(input: WeightedPurchasePriceInput): string {
  const currentCost = scaledCost(input.currentPurchasePrice);
  const currentQuantity = quantity(input.currentAvailableQuantity) + quantity(input.currentReservedQuantity);
  let receivedQuantity = 0n;
  let receivedValue = 0n;

  for (const item of input.receiptItems) {
    const available = quantity(item.availableQuantity);
    const defective = quantity(item.defectiveQuantity);
    if (available + defective === 0n) {
      throw CustomError.badRequest(errorMessages.inventory.emptyReceiptItem);
    }
    // Defective units also need a final cost for their movement, but do not affect this average.
    const cost = scaledCost(item.unitCostPen);
    receivedQuantity += available;
    receivedValue += available * cost;
  }

  // A defective-only receipt does not change the last purchase price, even with no good stock.
  const totalQuantity = currentQuantity + receivedQuantity;
  const result =
    receivedQuantity === 0n
      ? currentCost
      : roundNonNegativeDivision(currentQuantity * currentCost + receivedValue, totalQuantity);

  // Aggregate all lines before rounding half up once to six decimals.
  return `${result / SCALE}.${(result % SCALE).toString().padStart(6, '0')}`;
}
