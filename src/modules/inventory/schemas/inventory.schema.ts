import { DEFAULT_LIMIT, PAGINATION_LIMITS } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValueSerialSmall } from '@/shared/utils';
import { smallSerialIdSchema } from '@/shared/validators';
import { ADJUSTMENT_BUCKET, INVENTORY_BUCKET, STOCK_MOVEMENT_TYPE } from '../domain/constants';

export const adjustInventorySchema = z.strictObject({
  productVariantId: z.number().refine(isValueSerialSmall),
  bucket: z.enum(ADJUSTMENT_BUCKET),
  countedQuantity: z.number().int().min(0).max(2147483647),
  reason: z.string().trim().min(1).max(1000),
});

export type AdjustInventoryDto = z.infer<typeof adjustInventorySchema>;

const positiveIntegerQuery = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().max(2147483647));
export const inventoryBalancesQuerySchema = z.strictObject({
  page: positiveIntegerQuery.default(1),
  limit: positiveIntegerQuery
    .refine((value) => PAGINATION_LIMITS.some((limit) => limit === value))
    .default(DEFAULT_LIMIT),
  productVariantId: smallSerialIdSchema.optional(),
  bucket: z.enum(INVENTORY_BUCKET).optional(),
  search: z.string().trim().min(1).max(255).optional(),
});
export const inventoryMovementsQuerySchema = inventoryBalancesQuerySchema
  .extend({
    type: z.enum(STOCK_MOVEMENT_TYPE).optional(),
    orderId: z.uuidv4().optional(),
    supplierOrderId: z.uuidv4().optional(),
    createdBy: z.uuidv4().optional(),
    start: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    end: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  })
  .refine((query) => !query.start || !query.end || query.start <= query.end, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['end'],
  });

export type InventoryBalancesQuery = z.infer<typeof inventoryBalancesQuerySchema>;
export type InventoryMovementsQuery = z.infer<typeof inventoryMovementsQuerySchema>;
