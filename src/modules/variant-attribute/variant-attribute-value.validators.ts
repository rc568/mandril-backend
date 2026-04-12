import { z } from '@/shared/libs';
import { baseStringType } from '@/shared/validators';

export const createVariantAttributeValueSchema = z.object({
  value: baseStringType.max(35),
});

export const updateVariantAttributeValueSchema = createVariantAttributeValueSchema.partial();
export type VariantAttributeValueDto = z.infer<typeof createVariantAttributeValueSchema>;
export type VariantAttributeValueUpdateDto = Partial<VariantAttributeValueDto>;
