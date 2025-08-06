import { type AnyPgColumn, pgTable, smallint, smallserial, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';
import { softDelete } from '../helpers/columns.helpers';
import { productTable } from './product.schema';

// DB TABLES
export const catalogTable = pgTable('catalog', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 50 }).notNull(),
  slug: varchar({ length: 50 }).notNull(),
  ...softDelete,
});

export const categoryTable = pgTable('category', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 50 }).notNull(),
  slug: varchar({ length: 50 }).notNull(),
  parentId: smallint().references((): AnyPgColumn => categoryTable.id),
  ...softDelete,
});

// ORM RELATIONS
export const categoryRelations = relations(categoryTable, ({ one, many }) => ({
  parentCategory: one(categoryTable, {
    fields: [categoryTable.parentId],
    references: [categoryTable.id],
  }),
  subCategories: many(categoryTable),
  products: many(productTable),
}));

export const catalogRelations = relations(catalogTable, ({ many }) => ({
  products: many(productTable),
}));
