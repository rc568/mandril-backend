import { z } from '../../libs/zod';
import { createParamsIdSchema, smallSerialIdSchema } from './common.validator';

const variantAttributeValueSchema = z.object({
  value: z.string().max(20),
});

export const createVariantAttributeValueSchema = z.object({
  params: z.object({ id: smallSerialIdSchema }),
  body: variantAttributeValueSchema,
});

const paramsId = createParamsIdSchema(['attributeId', 'valueId']);

export const updateVariantAttributeValueSchema = paramsId.extend({
  body: variantAttributeValueSchema.partial(),
});

export type VariantAttributeValueDto = z.infer<typeof variantAttributeValueSchema>;
export type VariantAttributeValueUpdateDto = Partial<VariantAttributeValueDto>;
