import { integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { softDelete } from '../utils/drizzle-columns';

export const skuCounterTable = pgTable('sku_counter', {
  id: uuid().defaultRandom().primaryKey(),
  prefix: varchar({ length: 8 }).notNull().unique(),
  value: integer().notNull(),
  description: varchar({ length: 80 }),
  ...softDelete,
});
