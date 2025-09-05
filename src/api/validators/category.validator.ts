import * as z from 'zod';
import { isValueSerialSmall } from '../utils';
import { smallSerialIdSchema } from './common.validator';

const categorySchema = z.object({
  name: z.string(),
  slug: z
    .string('Slug must be an string')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only.'),
  parentId: z.number().refine(isValueSerialSmall, 'Inconsistent Value').optional(),
});

export const idSchema = z.object({
  params: z.object({ id: smallSerialIdSchema }),
});

export const createCategorySchema = z.object({
  body: categorySchema,
});

export const updateCategorySchema = z.object({
  params: z.object({ id: smallSerialIdSchema }),
  body: categorySchema.partial(),
});

export type CategoryDto = z.infer<typeof categorySchema>;
export type CategoryUpdateDto = Partial<CategoryDto>;

export async function partialValidateCategory(data: { [key: string]: any }) {
  return await categorySchema.partial().safeParseAsync(data);
}
