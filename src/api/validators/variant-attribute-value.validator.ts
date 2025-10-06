import { z } from '../../libs/zod';

export const createVariantAttributeValueSchema = z.object({
  value: z.string().max(20),
});

export const updateVariantAttributeValueSchema = createVariantAttributeValueSchema.partial();
export type VariantAttributeValueDto = z.infer<typeof createVariantAttributeValueSchema>;
export type VariantAttributeValueUpdateDto = Partial<VariantAttributeValueDto>;
