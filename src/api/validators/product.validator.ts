import * as z from 'zod';

export const productSchema = z.object({
  name: z.string(),
  slug: z.string(),
  code: z.string().length(5),
  description: z.string().optional(),
  price: z.number(),
  stock: z.string(),
  categoryId: z.string(),
  isActive: z.boolean(),
});

export type ProductDto = z.infer<typeof productSchema>;
export type ProductUpdateDto = Partial<ProductDto>;

export async function validateProduct(data: { [key: string]: any }) {
  return await productSchema.safeParseAsync(data);
}

export async function partialValidateProduct(data: { [key: string]: any }) {
  return await productSchema.partial().safeParseAsync(data);
}
