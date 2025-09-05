import * as z from 'zod';
import { isValidSlug } from '../utils';
import { smallSerialIdSchema } from './common.validator';

export const catalogSchema = z.object({
  name: z.string().max(50),
  slug: z
    .string('Slug must be a string')
    .refine(isValidSlug, 'Slug must be lowercase letters, numbers and hyphens only.'),
});

export const createCatalogSchema = z.object({
  body: catalogSchema,
});

export const updateCatalogSchema = z.object({
  params: z.object({ id: smallSerialIdSchema }),
  body: catalogSchema.partial(),
});

export type CatalogDto = z.infer<typeof catalogSchema>;
export type CatalogUpdateDto = Partial<CatalogDto>;
