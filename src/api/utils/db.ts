import { asc, desc } from 'drizzle-orm';
import { productTable } from '../../db/schemas';
import type { AdminProductOrderByOption } from '../../domain/product';

export const createColumnReferences = <T extends Record<string, true>>(
  booleanColumns: T,
  tableColumns: Record<keyof T, any>,
): { [K in keyof T]: any } => {
  const result = {} as { [K in keyof T]: any };
  for (const key in booleanColumns) {
    result[key] = tableColumns[key];
  }

  return result;
};

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
