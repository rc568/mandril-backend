import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValueSerialSmall } from '@/shared/utils';
import { baseStringType, paginationQuerySchema, uuidV4Schema } from '@/shared/validators';
import {
  SUPPLIER_ORDER_CURRENCY,
  SUPPLIER_ORDER_REVIEW_STATUS,
  SUPPLIER_ORDER_STATUS,
  SUPPLIER_ORDER_TYPE,
} from '../domain';
import { amountSchema, positiveAmountSchema } from './amount.schema';
import { validateSupplierOrderProduct } from './supplier-order.validation';

const productFieldsSchema = z.object({
  productVariantId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  type: z.enum(SUPPLIER_ORDER_TYPE),
  quantityOrdered: z.number().int().positive().max(2147483647),
  unitPrice: amountSchema,
});

export const supplierOrderProductSchema = productFieldsSchema.check(validateSupplierOrderProduct);
export const supplierOrderProductUpdateSchema = productFieldsSchema
  .extend({ id: uuidV4Schema.optional() })
  .check(validateSupplierOrderProduct);

const orderFieldsSchema = z.strictObject({
  supplierId: uuidV4Schema,
  currency: z.enum(SUPPLIER_ORDER_CURRENCY),
  supplierPaymentAmount: amountSchema,
  projectedExchangeRate: positiveAmountSchema.nullish(),
  trackingNumber: baseStringType.max(255).nullish(),
  importPolicy: baseStringType.max(255).nullish(),
  observation: baseStringType.nullish(),
});

export const createSupplierOrderSchema = orderFieldsSchema
  .extend({
    type: z.enum(SUPPLIER_ORDER_TYPE).default('PURCHASE'),
    products: z.array(supplierOrderProductSchema).nonempty(),
  })
  .check(({ value, issues }) => {
    const hasPurchase = value.products.some((product) => product.type === 'PURCHASE');
    if (value.type === 'PURCHASE' && !hasPurchase) {
      issues.push({
        code: 'custom',
        input: value.products,
        path: ['products'],
        message: errorMessages.supplierOrder.purchaseProductRequired,
      });
    }
    if (value.type === 'COMPENSATION' && hasPurchase) {
      issues.push({
        code: 'custom',
        input: value.products,
        path: ['products'],
        message: errorMessages.supplierOrder.compensationProductsOnly,
      });
    }
  });

// A provided products array replaces the current list; existing entries keep their IDs.
// The service validates the merged order, ownership, totals and editable status.
export const updateSupplierOrderSchema = orderFieldsSchema
  .partial()
  .extend({
    products: z.array(supplierOrderProductUpdateSchema).nonempty().optional(),
  })
  .check(({ value, issues }) => {
    if (!Object.values(value).some((field) => field !== undefined)) {
      issues.push({ code: 'custom', input: value, message: errorMessages.common.bodyEmpty });
    }
    const ids = value.products?.flatMap((item) => (item.id ? [item.id] : [])) ?? [];
    if (new Set(ids).size !== ids.length) {
      issues.push({
        code: 'custom',
        input: value.products,
        path: ['products'],
        message: errorMessages.supplierOrder.duplicatedLineIds,
      });
    }
  });

export const getSupplierOrdersQuerySchema = paginationQuerySchema.extend({
  supplierId: uuidV4Schema.optional(),
  type: z.enum(SUPPLIER_ORDER_TYPE).optional(),
  status: z.enum(SUPPLIER_ORDER_STATUS).optional(),
  reviewStatus: z.enum(SUPPLIER_ORDER_REVIEW_STATUS).optional(),
  currency: z.enum(SUPPLIER_ORDER_CURRENCY).optional(),
  search: baseStringType.optional(),
});

export type SupplierOrderCreateDto = z.infer<typeof createSupplierOrderSchema>;
export type SupplierOrderUpdateDto = z.infer<typeof updateSupplierOrderSchema>;
export type SupplierOrderProductDto = z.infer<typeof supplierOrderProductSchema>;
export type SupplierOrderProductUpdateDto = z.infer<typeof supplierOrderProductUpdateSchema>;
export type GetSupplierOrdersQuery = z.infer<typeof getSupplierOrdersQuerySchema>;
