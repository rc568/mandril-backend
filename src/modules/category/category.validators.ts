import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValidSlug, isValueSerialSmall } from '@/shared/utils';
import { baseStringType } from '@/shared/validators';

export const createCategorySchema = z.object({
  name: baseStringType.max(50),
  slug: baseStringType.refine(isValidSlug, errorMessages.common.slugFormat),
  parentId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const deleteCategoryQuerySchema = z.object({
  force: z.string().optional(),
});

export type CategoryDto = z.infer<typeof createCategorySchema>;
export type CategoryUpdateDto = Partial<CategoryDto>;
