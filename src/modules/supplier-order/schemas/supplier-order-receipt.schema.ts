import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValueSerialSmall } from '@/shared/utils';
import { baseStringType, uuidV4Schema } from '@/shared/validators';

export const supplierOrderReceiptItemSchema = z
  .strictObject({
    supplierOrderProductId: uuidV4Schema.nullish(),
    // Optional for expected lines: the service resolves and verifies the variant from the order.
    productVariantId: z
      .number()
      .int()
      .positive()
      .refine(isValueSerialSmall, errorMessages.common.invalidIdType)
      .optional(),
    availableQuantity: z.number().int().min(0).max(2147483647).default(0),
    defectiveQuantity: z.number().int().min(0).max(2147483647).default(0),
    sourceIssueId: uuidV4Schema.nullish(),
    observation: baseStringType.nullish(),
  })
  .check(({ value, issues }) => {
    if (value.supplierOrderProductId == null && value.productVariantId === undefined) {
      issues.push({
        code: 'custom',
        input: value,
        path: ['productVariantId'],
        message: errorMessages.supplierOrder.receiptVariantRequired,
      });
    }
    if (value.availableQuantity === 0 && value.defectiveQuantity === 0) {
      issues.push({
        code: 'custom',
        input: value,
        path: ['availableQuantity'],
        message: errorMessages.inventory.emptyReceiptItem,
      });
    }
  });

export const createSupplierOrderReceiptSchema = z.strictObject({
  receivedAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  observation: baseStringType.nullish(),
  items: z.array(supplierOrderReceiptItemSchema).nonempty(),
});

export const updateSupplierOrderReceiptSchema = z
  .strictObject({
    receivedAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    observation: baseStringType.nullish(),
    items: z.array(supplierOrderReceiptItemSchema).nonempty().optional(),
  })
  .check(({ value, issues }) => {
    if (Object.keys(value).length === 0) {
      issues.push({ code: 'custom', input: value, message: 'Debe enviar al menos un campo para actualizar.' });
    }
  });

// Review submits the whole package. Costs, audit fields and inventory posting belong to the services.
// Order ownership, cumulative quantities and compensation eligibility require database validation.
export const completeSupplierOrderReceiptReviewSchema = z.object({ observation: baseStringType.optional() }).optional();

export const supplierOrderReceiptsParamsSchema = z.object({ orderId: uuidV4Schema });
export const supplierOrderReceiptParamsSchema = supplierOrderReceiptsParamsSchema.extend({ receiptId: uuidV4Schema });
export type SupplierOrderReceiptCreateDto = z.infer<typeof createSupplierOrderReceiptSchema>;
export type SupplierOrderReceiptUpdateDto = z.infer<typeof updateSupplierOrderReceiptSchema>;
export type SupplierOrderReceiptItemDto = z.infer<typeof supplierOrderReceiptItemSchema>;
export type SupplierOrderReceiptCompleteReviewDto = z.infer<typeof completeSupplierOrderReceiptReviewSchema>;
