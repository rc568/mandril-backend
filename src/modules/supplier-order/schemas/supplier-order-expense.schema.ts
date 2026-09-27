import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType, uuidV4Schema } from '@/shared/validators';
import { SUPPLIER_ORDER_EXPENSE_TYPE } from '../domain';
import { positiveAmountSchema } from './amount.schema';
import { validateSupplierOrderExpense } from './supplier-order.validation';

const expenseFieldsSchema = z.strictObject({
  type: z.enum(SUPPLIER_ORDER_EXPENSE_TYPE),
  description: baseStringType.nullish(),
  amountUsd: positiveAmountSchema.nullish(),
  amountPen: positiveAmountSchema.nullish(),
  includedInSupplierPayment: z.boolean(),
});

export const createSupplierOrderExpenseSchema = expenseFieldsSchema
  .extend({ includedInSupplierPayment: z.boolean().default(false) })
  .check(validateSupplierOrderExpense);

// Missing fields are preserved. The service must validate the merged expense before saving.
export const updateSupplierOrderExpenseSchema = expenseFieldsSchema.partial().check(({ value, issues }) => {
  if (!Object.values(value).some((field) => field !== undefined)) {
    issues.push({ code: 'custom', input: value, message: errorMessages.common.bodyEmpty });
  }
  if (value.amountUsd === null && value.amountPen === null) {
    issues.push({
      code: 'custom',
      input: value,
      path: ['amountUsd'],
      message: errorMessages.supplierOrder.expenseAmountRequired,
    });
  }
  if (value.type === 'OTHER' && value.description === null) {
    issues.push({
      code: 'custom',
      input: value.description,
      path: ['description'],
      message: errorMessages.supplierOrder.expenseDescriptionRequired,
    });
  }
});

export const supplierOrderExpensesParamsSchema = z.object({ orderId: uuidV4Schema });
export const supplierOrderExpenseParamsSchema = supplierOrderExpensesParamsSchema.extend({ expenseId: uuidV4Schema });

export type SupplierOrderExpenseCreateDto = z.infer<typeof createSupplierOrderExpenseSchema>;
export type SupplierOrderExpenseUpdateDto = z.infer<typeof updateSupplierOrderExpenseSchema>;
