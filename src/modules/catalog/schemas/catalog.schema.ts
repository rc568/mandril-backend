import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValidSlug } from '@/shared/utils';
import { baseStringType, booleanStringQuery } from '@/shared/validators';

export const createCatalogSchema = z.object({
  name: baseStringType.max(50),
  slug: baseStringType.refine(isValidSlug, errorMessages.common.slugFormat),
});

export const updateCatalogSchema = createCatalogSchema.partial();

export const deleteCatalogQuerySchema = z.object({
  force: booleanStringQuery,
});

export type CatalogDto = z.infer<typeof createCatalogSchema>;
export type CatalogUpdateDto = Partial<CatalogDto>;
