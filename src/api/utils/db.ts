import type { OrderSortBy } from '../../domain/order';
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
      return 'prod.name ASC';
    case 'name_desc':
      return 'prod.name DESC';
    default:
      return 'prod.name ASC';
  }
};

export const setOrderSortBy = (sortBy: OrderSortBy | (string & {}) | undefined) => {
  switch (sortBy) {
    case 'date_asc':
      return 'o.created_at ASC';
    case 'date_desc':
      return 'o.created_at DESC';
    case 'total_sale_asc':
      return 'o.total_sale ASC';
    case 'total_sale_desc':
      return 'o.total_sale DESC';
    default:
      return 'o.created_at DESC';
  }
};
