import { errorMessages } from '../../domain/constants';
import { z } from '../../libs/zod';
import { isValidSlug } from '../utils';

export const createCatalogSchema = z.object({
  name: z.string().max(50),
  slug: z.string().refine(isValidSlug, errorMessages.common.slugFormat),
});

export const updateCatalogSchema = createCatalogSchema.partial();

export const deleteCatalogQuerySchema = z.object({
  force: z.string().optional(),
});

export type CatalogDto = z.infer<typeof createCatalogSchema>;
export type CatalogUpdateDto = Partial<CatalogDto>;
