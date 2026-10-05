import { type AnyPgColumn, pgTable, smallint, smallserial, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';
import { productTable } from './product.schema';
import { softDeleteAudit } from './shared';

// DB TABLES
export const catalogTable = pgTable('catalog', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 50 }).notNull(),
  slug: varchar({ length: 50 }).notNull().unique(),
  ...softDeleteAudit,
});

export const categoryTable = pgTable('category', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 50 }).notNull(),
  slug: varchar({ length: 50 }).notNull().unique(),
  parentId: smallint().references((): AnyPgColumn => categoryTable.id),
  ...softDeleteAudit,
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
