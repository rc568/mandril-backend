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
  quantityInStock: integer().notNull().default(0),
  isActive: boolean().default(true),
  productId: smallint().references(() => productTable.id),
  ...softDelete,
});

export const variantAttributeTable = pgTable('variant_attribute', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 30 }).notNull(),
  description: text(),
  ...timestamps,
});

export const variantAttributeValuesTable = pgTable('variant_attribute_values', {
  id: smallserial().primaryKey(),
  value: varchar({ length: 20 }).notNull(),
  variantAttributeId: smallint().references(() => variantAttributeTable.id, {
    onDelete: 'cascade',
  }),
  ...timestamps,
});

export const variantAttributeMapTable = pgTable(
  'variant_attribute_map',
  {
    variantValueId: smallint()
      .references(() => variantAttributeValuesTable.id)
      .notNull(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.variantValueId, t.productVariantId] })],
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

export const productVariantRelations = relations(productVariantTable, ({ many, one }) => ({
  images: many(productImagesTable),
  variantValuesMap: many(variantAttributeMapTable),
  orderProducts: many(orderProductTable),
  supplierOrderProducts: many(supplierOrderProductTable),
  productParent: one(productTable, {
    fields: [productVariantTable.productId],
    references: [productTable.id],
  }),
}));

export const variantAttributeRelations = relations(variantAttributeTable, ({ many }) => ({
  values: many(variantAttributeValuesTable),
}));

export const variantAttributeValuesRelations = relations(
  variantAttributeValuesTable,
  ({ many, one }) => ({
    attribute: one(variantAttributeTable, {
      fields: [variantAttributeValuesTable.variantAttributeId],
      references: [variantAttributeTable.id],
    }),
    variantValuesMap: many(variantAttributeMapTable),
  }),
);

export const variantAttributeMapRelations = relations(variantAttributeMapTable, ({ one }) => ({
  variantValue: one(variantAttributeValuesTable, {
    fields: [variantAttributeMapTable.variantValueId],
    references: [variantAttributeValuesTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [variantAttributeMapTable.productVariantId],
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
