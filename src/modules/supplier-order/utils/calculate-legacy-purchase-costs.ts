import { CustomError, errorMessages } from '@/shared/domain';
import { roundNonNegativeDivision } from '@/shared/utils/round-non-negative-division';

interface CostProduct {
  id: string;
  type: 'PURCHASE' | 'COMPENSATION';
  quantityOrdered: number;
  unitPrice: string | null;
}

interface CostExpense {
  amountUsd: string | null;
  amountPen: string | null;
}

interface LegacyCostInput {
  currency: 'USD' | 'PEN';
  projectedExchangeRate: string | null;
  products: CostProduct[];
  expenses: CostExpense[];
}

const SCALE = 1_000_000n;
const MAX_AMOUNT = 999_999_999_999n;

function scaledAmount(value: string): bigint {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(value)) {
    throw CustomError.badRequest(errorMessages.supplierOrder.costAmountInvalid);
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}

function roundedAmount(numerator: bigint, denominator: bigint): string {
  // Round half up only at the final six-decimal boundary.
  const amount = roundNonNegativeDivision(numerator, denominator);
  if (amount > MAX_AMOUNT) throw CustomError.badRequest(errorMessages.supplierOrder.costTooLarge);
  return `${amount / SCALE}.${(amount % SCALE).toString().padStart(6, '0')}`;
}

// Pure LEGACY_V1 calculation: no persistence, inventory updates or current tax interpretation.
// Compensation costs come from their source receipt issues, not this allocation.
export function calculateLegacyPurchaseCosts(input: LegacyCostInput) {
  const products = input.products
    .filter((product) => product.type === 'PURCHASE')
    .map((product) => {
      if (product.unitPrice === null) throw CustomError.badRequest(errorMessages.supplierOrder.costDataMissing);
      if (
        !Number.isInteger(product.quantityOrdered) ||
        product.quantityOrdered <= 0 ||
        product.quantityOrdered > 2147483647
      ) {
        throw CustomError.badRequest(errorMessages.supplierOrder.costAmountInvalid);
      }
      return { ...product, price: scaledAmount(product.unitPrice) };
    });
  if (products.length === 0) return [];

  const fob = products.reduce((total, product) => total + product.price * BigInt(product.quantityOrdered), 0n);
  if (fob === 0n) throw CustomError.badRequest(errorMessages.supplierOrder.costBaseRequired);
  const expenses = input.expenses.reduce((total, expense) => {
    const amount = input.currency === 'USD' ? expense.amountUsd : expense.amountPen;
    if (amount === null) throw CustomError.badRequest(errorMessages.supplierOrder.costDataMissing);
    return total + scaledAmount(amount);
  }, 0n);
  // FOB plus each expense once. The supplier payment is a payment record, not an additional cost.
  const total = fob + expenses;
  const rate =
    input.currency === 'PEN'
      ? SCALE
      : input.projectedExchangeRate === null
        ? null
        : scaledAmount(input.projectedExchangeRate);
  if (rate === 0n) throw CustomError.badRequest(errorMessages.supplierOrder.costAmountInvalid);

  return products.map((product) => {
    // Preserve the agreed legacy 18% addition; future formulas need a separate version.
    const numerator = total * product.price * 118n;
    const denominator = fob * 100n;
    return {
      supplierOrderProductId: product.id,
      calculatedUnitCost: roundedAmount(numerator, denominator),
      // Convert the unrounded result so the PEN value does not accumulate rounding errors.
      calculatedUnitCostPen: rate === null ? null : roundedAmount(numerator * rate, denominator * SCALE),
    };
  });
}
