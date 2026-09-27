import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';

const decimalNumberSchema = z
  .number()
  .min(0)
  .max(999999.999999)
  .refine((value) => value === Number(value.toFixed(6)), errorMessages.supplierOrder.amountPrecision);

export const amountSchema = decimalNumberSchema.transform((value) => value.toFixed(6));
export const positiveAmountSchema = decimalNumberSchema.positive().transform((value) => value.toFixed(6));
