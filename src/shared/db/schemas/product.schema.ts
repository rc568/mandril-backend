import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  decimal,
  integer,
  pgTable,
  smallint,
  smallserial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { softDelete, timestamps } from '../utils/drizzle-columns';
import { catalogTable, categoryTable, orderProductTable, supplierOrderProductTable, userTable } from '.';
import { creationAudit, userAudit } from './shared';

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

export const productVariantTable = pgTable(
  'product_variant',
  {
    id: smallserial().primaryKey(),
    code: char({ length: 5 }).notNull().unique(),
    price: decimal({ precision: 12, scale: 6 }).notNull(),
    purchasePrice: decimal({ precision: 12, scale: 6 }).notNull(),
    quantityInStock: integer().notNull().default(0),
    warrantyMonths: integer(),
    lengthCm: decimal({ precision: 12, scale: 2 }),
    widthCm: decimal({ precision: 12, scale: 2 }),
    heightCm: decimal({ precision: 12, scale: 2 }),
    weightGrams: decimal({ precision: 12, scale: 2 }),
    packageLengthCm: decimal({ precision: 12, scale: 2 }),
    packageWidthCm: decimal({ precision: 12, scale: 2 }),
    packageHeightCm: decimal({ precision: 12, scale: 2 }),
    stockAlertThreshold: integer(),
    offerPrice: decimal({ precision: 12, scale: 6 }),
    offerStartsAt: timestamp({ withTimezone: true }),
    offerEndsAt: timestamp({ withTimezone: true }),
    isActive: boolean().default(true),
    productId: smallint()
      .references(() => productTable.id)
      .notNull(),
    ...softDelete,
    ...userAudit,
  },
  (t) => [
    check(
      'product_variant_offer_check',
      sql`(
      ${t.offerPrice} IS NULL AND ${t.offerStartsAt} IS NULL AND ${t.offerEndsAt} IS NULL
    ) OR (
      ${t.offerPrice} IS NOT NULL AND ${t.offerStartsAt} IS NOT NULL AND ${t.offerEndsAt} IS NOT NULL
      AND ${t.offerPrice} > 0 AND ${t.offerPrice} < ${t.price}
      AND ${t.offerEndsAt} > ${t.offerStartsAt}
    )`,
    ),
    check('product_variant_warranty_months_check', sql`${t.warrantyMonths} >= 0`),
    check('product_variant_stock_alert_threshold_check', sql`${t.stockAlertThreshold} >= 0`),
    check(
      'product_variant_measurements_check',
      sql`${t.lengthCm} > 0 AND ${t.widthCm} > 0 AND ${t.heightCm} > 0 AND ${t.weightGrams} > 0 AND ${t.packageLengthCm} > 0 AND ${t.packageWidthCm} > 0 AND ${t.packageHeightCm} > 0`,
    ),
  ],
);

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
    value: varchar({ length: 35 }).notNull(),
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

export const productImagesTable = pgTable(
  'product_images',
  {
    id: uuid().defaultRandom().primaryKey(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    imageUrl: text().notNull(),
    position: integer().notNull(),
    isPrimary: boolean().notNull(),
    ...creationAudit,
  },
  (t) => [
    check('product_images_position_check', sql`${t.position} > 0`),
    uniqueIndex('product_images_variant_position_unique').on(t.productVariantId, t.position),
    uniqueIndex('product_images_variant_primary_unique').on(t.productVariantId).where(sql`${t.isPrimary} = true`),
  ],
);

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
  user: one(userTable, {
    fields: [productTable.createdBy],
    references: [userTable.id],
  }),
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
  user: one(userTable, {
    fields: [productVariantTable.createdBy],
    references: [userTable.id],
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
