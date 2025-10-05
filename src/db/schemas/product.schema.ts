import { relations } from 'drizzle-orm';
import {
  boolean,
  char,
  decimal,
  integer,
  pgTable,
  smallint,
  smallserial,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { softDelete, timestamps } from '../helpers/columns.helpers';
import { catalogTable, categoryTable, orderProductTable, supplierOrderProductTable, userAudit } from '.';

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
  ...userAudit,
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
  ...userAudit,
});

export const variantAttributeTable = pgTable('variant_attribute', {
  id: smallserial().primaryKey(),
  name: varchar({ length: 30 }).notNull().unique(),
  description: text(),
  ...timestamps,
});

export const variantAttributeValueTable = pgTable(
  'variant_attribute_value',
  {
    id: smallserial().primaryKey(),
    value: varchar({ length: 20 }).notNull(),
    variantAttributeId: smallint().references(() => variantAttributeTable.id, {
      onDelete: 'cascade',
    }),
    ...timestamps,
  },
  (t) => [uniqueIndex('variantAttributeValueIndex').on(t.value, t.variantAttributeId)],
);

export const productVariantToValueTable = pgTable(
  'product_variant_to_value',
  {
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    variantAttributeValueId: smallint()
      .references(() => variantAttributeValueTable.id)
      .notNull(),
    variantAttributeId: smallint()
      .references(() => variantAttributeTable.id)
      .notNull(),
  },
  (t) => [uniqueIndex('productVariantToAttributeIndex').on(t.productVariantId, t.variantAttributeId)],
);

export const productToVariantAttributeTable = pgTable(
  'product_to_variant_attribute',
  {
    productId: smallint()
      .references(() => productTable.id)
      .notNull(),
    variantAttributeId: smallint()
      .references(() => variantAttributeTable.id)
      .notNull(),
  },
  (t) => [uniqueIndex('productToVariantAttributeIndex').on(t.productId, t.variantAttributeId)],
);

export const productImagesTable = pgTable('product_images', {
  id: uuid().defaultRandom().primaryKey(),
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
  attributes: many(productToVariantAttributeTable),
}));

export const productVariantRelations = relations(productVariantTable, ({ many, one }) => ({
  images: many(productImagesTable),
  variantValues: many(productVariantToValueTable),
  orderProducts: many(orderProductTable),
  supplierOrderProducts: many(supplierOrderProductTable),
  productParent: one(productTable, {
    fields: [productVariantTable.productId],
    references: [productTable.id],
  }),
}));

export const variantAttributeRelations = relations(variantAttributeTable, ({ many }) => ({
  values: many(variantAttributeValueTable),
  productAttributes: many(productVariantToValueTable),
}));

export const variantAttributeValuesRelations = relations(variantAttributeValueTable, ({ many, one }) => ({
  attribute: one(variantAttributeTable, {
    fields: [variantAttributeValueTable.variantAttributeId],
    references: [variantAttributeTable.id],
  }),
  productVariants: many(productVariantToValueTable),
}));

export const productVariantToValueRelations = relations(productVariantToValueTable, ({ one }) => ({
  variantValues: one(variantAttributeValueTable, {
    fields: [productVariantToValueTable.variantAttributeValueId],
    references: [variantAttributeValueTable.id],
  }),
  productVariants: one(productVariantTable, {
    fields: [productVariantToValueTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));

export const productToVariantAttributeRelations = relations(productToVariantAttributeTable, ({ one }) => ({
  attributes: one(variantAttributeTable, {
    fields: [productToVariantAttributeTable.variantAttributeId],
    references: [variantAttributeTable.id],
  }),
  products: one(productTable, {
    fields: [productToVariantAttributeTable.productId],
    references: [productTable.id],
  }),
}));

export const productImagesRelations = relations(productImagesTable, ({ one }) => ({
  productVariant: one(productVariantTable, {
    fields: [productImagesTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));

export type ProductInsertType = typeof categoryTable.$inferInsert;
