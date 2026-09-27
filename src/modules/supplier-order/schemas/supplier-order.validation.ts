import { errorMessages } from '@/shared/domain';
import type { z } from '@/shared/libs';

export const validateSupplierOrderProduct = ({
  value,
  issues,
}: z.core.ParsePayload<{ type: string; unitPrice: string; quantityOrdered: number }>) => {
  if (issues.length > 0) return;
  if (value.type === 'COMPENSATION' && value.unitPrice !== '0.000000') {
    issues.push({
      code: 'custom',
      input: value.unitPrice,
      path: ['unitPrice'],
      message: errorMessages.supplierOrder.compensationPriceMustBeZero,
    });
  }

  // Compare scaled integers to validate the generated subtotal without floating-point arithmetic.
  const subtotal = BigInt(value.unitPrice.replace('.', '')) * BigInt(value.quantityOrdered);
  if (subtotal > 999999999999n) {
    issues.push({
      code: 'custom',
      input: value.quantityOrdered,
      path: ['quantityOrdered'],
      message: errorMessages.supplierOrder.subtotalTooLarge,
    });
  }
};

export const validateSupplierOrderExpense = ({
  value,
  issues,
}: z.core.ParsePayload<{
  type: string;
  description?: string | null;
  amountUsd?: string | null;
  amountPen?: string | null;
}>) => {
  if (value.amountUsd == null && value.amountPen == null) {
    issues.push({
      code: 'custom',
      input: value,
      path: ['amountUsd'],
      message: errorMessages.supplierOrder.expenseAmountRequired,
    });
  }
  if (value.type === 'OTHER' && !value.description) {
    issues.push({
      code: 'custom',
      input: value.description,
      path: ['description'],
      message: errorMessages.supplierOrder.expenseDescriptionRequired,
    });
  }
};
