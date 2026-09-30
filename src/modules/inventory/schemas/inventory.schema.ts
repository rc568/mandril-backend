import { z } from '@/shared/libs';
import { isValueSerialSmall } from '@/shared/utils';
import { ADJUSTMENT_BUCKET } from '../domain/constants';

export const adjustInventorySchema = z.strictObject({
  productVariantId: z.number().refine(isValueSerialSmall),
  bucket: z.enum(ADJUSTMENT_BUCKET),
  countedQuantity: z.number().int().min(0).max(2147483647),
  reason: z.string().trim().min(1).max(1000),
});

export type AdjustInventoryDto = z.infer<typeof adjustInventorySchema>;
