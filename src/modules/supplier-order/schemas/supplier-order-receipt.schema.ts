import { z } from '@/shared/libs';
import { baseStringType, uuidV4Schema } from '@/shared/validators';

export const createSupplierOrderReceiptSchema = z.strictObject({
  packageNumber: z.number().int().positive().max(2147483647),
  receivedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  observation: baseStringType.nullish(),
});

export const supplierOrderReceiptsParamsSchema = z.object({ orderId: uuidV4Schema });
export const supplierOrderReceiptParamsSchema = supplierOrderReceiptsParamsSchema.extend({ receiptId: uuidV4Schema });
export type SupplierOrderReceiptCreateDto = z.infer<typeof createSupplierOrderReceiptSchema>;
