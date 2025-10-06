import { z } from '../../libs/zod';

export const createVariantAttributeSchema = z.object({
  name: z.string().max(30),
  description: z.string().max(80).optional(),
});

export const updateVariantAttributeSchema = createVariantAttributeSchema.partial();
export type VariantAttributeDto = z.infer<typeof createVariantAttributeSchema>;
export type VariantAttributeUpdateDto = Partial<VariantAttributeDto>;
