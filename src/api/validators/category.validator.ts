import { errorMessages } from '../../domain/constants';
import { z } from '../../libs/zod';
import { isValidSlug, isValueSerialSmall } from '../utils';

export const createCategorySchema = z.object({
  name: z.string(),
  slug: z.string().refine(isValidSlug, { abort: true, error: errorMessages.common.slugFormat }),
  parentId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const deleteCategoryQuerySchema = z.object({
  force: z.string().optional(),
});

export type CategoryDto = z.infer<typeof createCategorySchema>;
export type CategoryUpdateDto = Partial<CategoryDto>;
