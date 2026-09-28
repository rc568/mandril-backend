import { SUPPLIER_ORDER_ISSUE_TYPE } from '@/modules/supplier-order/domain';
import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType, uuidV4Schema } from '@/shared/validators';

export const createSupplierOrderIssueSchema = z
  .strictObject({
    type: z.enum(SUPPLIER_ORDER_ISSUE_TYPE),
    supplierOrderProductId: uuidV4Schema.nullish(),
    receiptItemId: uuidV4Schema.nullish(),
    quantity: z.number().int().positive().max(2147483647),
    description: baseStringType.min(1),
  })
  .refine(
    (value) => {
      if (value.type === 'SHORTAGE') return value.supplierOrderProductId != null && value.receiptItemId == null;
      if (value.type === 'WRONG_PRODUCT') return value.supplierOrderProductId != null && value.receiptItemId != null;
      return value.receiptItemId != null;
    },
    { message: errorMessages.supplierOrder.issueReferencesRequired },
  );

export const closeSupplierOrderIssueSchema = z.strictObject({ resolutionNote: baseStringType.min(1) });
export const supplierOrderIssuesParamsSchema = z.object({ orderId: uuidV4Schema });
export const supplierOrderIssueParamsSchema = supplierOrderIssuesParamsSchema.extend({ issueId: uuidV4Schema });
export type SupplierOrderIssueCreateDto = z.infer<typeof createSupplierOrderIssueSchema>;
export type SupplierOrderIssueCloseDto = z.infer<typeof closeSupplierOrderIssueSchema>;
