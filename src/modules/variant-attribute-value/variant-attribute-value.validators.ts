import { z } from '@/shared/libs';

export const createVariantAttributeValueSchema = z.object({
  value: z.string().max(35),
});

export const updateVariantAttributeValueSchema = createVariantAttributeValueSchema.partial();
export type VariantAttributeValueDto = z.infer<typeof createVariantAttributeValueSchema>;
export type VariantAttributeValueUpdateDto = Partial<VariantAttributeValueDto>;
