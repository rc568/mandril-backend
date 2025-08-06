import { relations } from 'drizzle-orm';
import { decimal, integer, pgEnum, pgTable, primaryKey, smallint, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { softDelete, timestamps } from '../helpers/columns.helpers';
import { productVariantTable } from './product.schema';

export const supplierOrderStatusEnum = pgEnum('supplier_order_status', ['En camino', 'Recibido', 'Cancelado']);

export const supplierTable = pgTable('supplier', {
  id: uuid().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  ...timestamps,
});

export const supplierOrderTable = pgTable('supplier_order', {
  id: uuid().primaryKey(),
  guide: varchar({ length: 20 }).notNull(),
  import_policy: varchar({ length: 20 }).notNull(),
  supplierId: uuid().references(() => supplierTable.id),
  status: supplierOrderStatusEnum().default('En camino').notNull(),
  observation: text(),
  ...softDelete,
});

export const supplierOrderProductTable = pgTable(
  'supplier_order_product',
  {
    supplierOrderId: uuid()
      .references(() => supplierOrderTable.id)
      .notNull(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    purchasePrice: decimal({ precision: 12, scale: 6 }).notNull(),
    quantity: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.supplierOrderId, t.productVariantId] })],
);

// ORM RELATIONS

export const supplierRelations = relations(supplierTable, ({ many }) => ({
  orders: many(supplierOrderTable),
}));

export const supplierOrderRelations = relations(supplierOrderTable, ({ many, one }) => ({
  products: many(supplierOrderProductTable),
  supplier: one(supplierTable, {
    fields: [supplierOrderTable.supplierId],
    references: [supplierTable.id],
  }),
}));

export const supplierOrderProductRelations = relations(supplierOrderProductTable, ({ one }) => ({
  supplierOrder: one(supplierOrderTable, {
    fields: [supplierOrderProductTable.supplierOrderId],
    references: [supplierOrderTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [supplierOrderProductTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));
