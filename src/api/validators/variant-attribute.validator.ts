import { z } from '../../libs/zod';
import { smallSerialIdSchema } from './common.validator';

const variantAttributeSchema = z.object({
  name: z.string().max(30),
  description: z.string().max(80).optional(),
});

export const createVariantAttributeSchema = z.object({
  body: variantAttributeSchema,
});

export const updateVariantAttributeSchema = z.object({
  params: z.object({ id: smallSerialIdSchema }),
  body: variantAttributeSchema.partial(),
});

export type VariantAttributeDto = z.infer<typeof variantAttributeSchema>;
export type VariantAttributeUpdateDto = Partial<VariantAttributeDto>;
