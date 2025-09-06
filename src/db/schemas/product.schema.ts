import { relations } from 'drizzle-orm';
import {
  boolean,
  char,
  decimal,
  integer,
  pgTable,
  primaryKey,
  serial,
  smallint,
  smallserial,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { softDelete, timestamps } from '../helpers/columns.helpers';
import { catalogTable, categoryTable } from './collection.schema';
import { orderProductTable } from './order.schema';
import { supplierOrderProductTable } from './supplier.schema';

// DB TABLES
export const productTable = pgTable('product', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  slug: varchar({ length: 255 }).notNull().unique(),
  description: text(),
  isActive: boolean().default(true),
  categoryId: smallint().references(() => categoryTable.id),
  catalogId: smallint().references(() => catalogTable.id),
  ...softDelete,
});

export const productVariantTable = pgTable('product_variant', {
  id: smallserial().primaryKey(),
  code: char({ length: 5 }).notNull().unique(),
  price: decimal({ precision: 12, scale: 6 }).notNull(),
  purchasePrice: decimal({ precision: 12, scale: 6 }).notNull(),
  quantity_in_stock: integer().notNull().default(0),
  isActive: boolean().default(true),
  productId: smallint().references(() => productTable.id),
  ...softDelete,
});

export const productOptionsTable = pgTable('product_options', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 30 }).notNull(),
  description: text(),
  ...timestamps,
});

export const optionValueTable = pgTable('option_values', {
  id: smallserial().primaryKey(),
  value: varchar({ length: 20 }).notNull(),
  productOptionId: smallint().references(() => productOptionsTable.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const variantOptionValuesTable = pgTable(
  'variant_option_values',
  {
    optionValueId: smallint()
      .references(() => optionValueTable.id)
      .notNull(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.optionValueId, t.productVariantId] })],
);

export const productImagesTable = pgTable('product_images', {
  id: serial().primaryKey(),
  imageUrl: text().notNull(),
  productVariantId: smallint().references(() => productVariantTable.id),
  ...timestamps,
});

// ORM RELATIONS
export const productRelations = relations(productTable, ({ many, one }) => ({
  productVariant: many(productVariantTable),
  category: one(categoryTable, {
    fields: [productTable.categoryId],
    references: [categoryTable.id],
  }),
  catalog: one(catalogTable, {
    fields: [productTable.catalogId],
    references: [catalogTable.id],
  }),
}));

// TODO: MANY RELATIONS
export const productVariantRelations = relations(productVariantTable, ({ many, one }) => ({
  images: many(productImagesTable),
  optionValues: many(variantOptionValuesTable),
  orderProducts: many(orderProductTable),
  supplierOrderProducts: many(supplierOrderProductTable),
  productParent: one(productTable, {
    fields: [productVariantTable.productId],
    references: [productTable.id],
  }),
}));

export const productOptionsRelations = relations(productOptionsTable, ({ many }) => ({
  optionValues: many(optionValueTable),
}));

export const optionValueRelations = relations(optionValueTable, ({ many, one }) => ({
  productOption: one(productOptionsTable, {
    fields: [optionValueTable.productOptionId],
    references: [productOptionsTable.id],
  }),
  variantOptions: many(variantOptionValuesTable),
}));

export const variantOptionValuesRelations = relations(variantOptionValuesTable, ({ one }) => ({
  optionValue: one(optionValueTable, {
    fields: [variantOptionValuesTable.optionValueId],
    references: [optionValueTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [variantOptionValuesTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));

export const productImagesRelations = relations(productImagesTable, ({ one }) => ({
  productVariant: one(productVariantTable, {
    fields: [productImagesTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));

export type ProductInsertType = typeof categoryTable.$inferInsert;
