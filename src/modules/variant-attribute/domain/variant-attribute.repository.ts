import { eq } from 'drizzle-orm';
import { db, type Transaction, variantAttributeTable } from '@/shared/db';

const columnsToSelectBool = {
  id: true,
  name: true,
  description: true,
} as const;

export const findAttributeById = async (id: number, tx?: Transaction) => {
  const executor = tx ?? db;

  return executor.query.variantAttributeTable.findFirst({
    where: eq(variantAttributeTable.id, id),
    columns: columnsToSelectBool,
  });
};
