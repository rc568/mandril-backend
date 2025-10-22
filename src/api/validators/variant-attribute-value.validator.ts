import { z } from '../../libs/zod';

export const createVariantAttributeValueSchema = z.object({
  value: z.string().max(35),
});

export const updateVariantAttributeValueSchema = createVariantAttributeValueSchema.partial();
export type VariantAttributeValueDto = z.infer<typeof createVariantAttributeValueSchema>;
export type VariantAttributeValueUpdateDto = Partial<VariantAttributeValueDto>;
