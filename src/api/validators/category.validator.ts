import * as z from 'zod';

export const categorySchema = z.object({
  categoria: z.string(),
  slug: z.string('Slug must be an string'),
});

export type CategoryDto = z.infer<typeof categorySchema>;
export type CategoryUpdateDto = Partial<CategoryDto>;

export async function validateCategory(data: { [key: string]: any }) {
  return await categorySchema.safeParseAsync(data);
}

export async function partialValidateCategory(data: { [key: string]: any }) {
  return await categorySchema.partial().safeParseAsync(data);
}
