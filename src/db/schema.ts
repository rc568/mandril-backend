import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  char,
  decimal,
  integer,
  pgTable,
  smallint,
  smallserial,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const productTable = pgTable('product', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  slug: varchar({ length: 255 }).notNull().unique(),
  code: char({ length: 5 }).notNull().unique(),
  description: text(),
  price: decimal({ precision: 12, scale: 6 }).notNull(),
  stock: integer().notNull().default(0),
  categoryId: smallint().references(() => categoryTable.id),
  isActive: boolean().default(true),
});

export const categoryTable = pgTable('category', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 50 }).notNull(),
  slug: varchar({ length: 50 }).notNull(),
  parentId: smallint().references((): AnyPgColumn => categoryTable.id),
});

export const productImagesTable = pgTable('product_images', {
  id: uuid().primaryKey().defaultRandom(),
  imageUrl: text().notNull(),
  productId: smallint().references(() => productTable.id),
});

export const productRelations = relations(productTable, ({ many, one }) => ({
  images: many(productImagesTable),
  category: one(categoryTable, {
    fields: [productTable.categoryId],
    references: [categoryTable.id],
  }),
}));

// TODO: adding inverse children (subcategories (many) => categories)
export const categoryRelations = relations(categoryTable, ({ one, many }) => ({
  parentCategory: one(categoryTable, {
    fields: [categoryTable.parentId],
    references: [categoryTable.id],
  }),
  products: many(productTable),
}));

export const productImagesRelations = relations(productImagesTable, ({ one }) => ({
  product: one(productTable, {
    fields: [productImagesTable.productId],
    references: [productTable.id],
  }),
}));

export type ProductInsertType = typeof categoryTable.$inferInsert;

// NO NEEDED
// export const categoryRelationsTable = pgTable(
//   'category_relations',
//   {
//     parentId: integer('parent_id')
//       .notNull()
//       .references(() => categoryTable.id),
//     childId: integer('child_id')
//       .notNull()
//       .references(() => categoryTable.id),
//   },
//   (table) => [primaryKey({ columns: [table.parentId, table.childId] })],
// );
