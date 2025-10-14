import { asc, desc } from 'drizzle-orm';
import { productTable } from '../../db/schemas';
import type { AdminProductOrderByOption } from '../../domain/product';

export const setAdminProductOrderBy = (orderBy: AdminProductOrderByOption | (string & {}) | undefined) => {
  switch (orderBy) {
    case 'name_asc':
      return asc(productTable.name);
    case 'name_desc':
      return desc(productTable.name);
    default:
      return asc(productTable.name);
  }
};
