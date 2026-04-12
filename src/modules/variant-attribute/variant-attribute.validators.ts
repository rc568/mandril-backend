import { z } from '@/shared/libs/';
import { baseStringType } from '@/shared/validators';

export const createVariantAttributeSchema = z.object({
  name: baseStringType.max(30),
  description: baseStringType.max(80).optional(),
});

export const updateVariantAttributeSchema = createVariantAttributeSchema.partial();
export type VariantAttributeDto = z.infer<typeof createVariantAttributeSchema>;
export type VariantAttributeUpdateDto = Partial<VariantAttributeDto>;
