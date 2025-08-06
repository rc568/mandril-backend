import { relations } from 'drizzle-orm';
import {
  decimal,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  smallserial,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { softDelete, timestamps } from '../helpers/columns.helpers';
import { productVariantTable } from './product.schema';

export const documentTypeEnum = pgEnum('document_type', ['Boleta', 'Factura', 'S/D']);
export const orderStatusEnum = pgEnum('order_status', ['Pendiente', 'Entregado', 'Cancelado']);

export const orderTable = pgTable('order', {
  id: uuid().primaryKey(),
  salesChannelId: smallint().references(() => salesChannelTable.id),
  receiptNumber: varchar({ length: 50 }).notNull().unique(),
  clientId: uuid().references(() => clientTable.id),
  status: orderStatusEnum().notNull().default('Pendiente'),
  observation: text(),
  ...softDelete,
});

export const salesChannelTable = pgTable('sales_channel', {
  id: smallserial().primaryKey(),
  channel: varchar({ length: 25 }).notNull(),
  ...softDelete,
});

export const clientTable = pgTable('client', {
  id: uuid().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  document_type: documentTypeEnum().default('S/D').notNull(),
  document_number: varchar({ length: 11 }).notNull().unique(),
  email: varchar({ length: 255 }).unique(),
  contactNumber1: varchar({ length: 20 }),
  contactNumber2: varchar({ length: 20 }),
  ...timestamps,
});

export const orderProductTable = pgTable(
  'order_products',
  {
    orderId: uuid()
      .references(() => orderTable.id)
      .notNull(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    price: decimal({ precision: 12, scale: 6 }).notNull(),
    quantity: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.productVariantId] })],
);

// ORM RELATIONS
export const orderRelations = relations(orderTable, ({ many, one }) => ({
  salesChannel: one(salesChannelTable, {
    fields: [orderTable.salesChannelId],
    references: [salesChannelTable.id],
  }),
  client: one(clientTable, {
    fields: [orderTable.clientId],
    references: [clientTable.id],
  }),
  orderProducts: many(orderProductTable),
}));

export const salesChannelRelations = relations(salesChannelTable, ({ many }) => ({
  orders: many(orderTable),
}));

export const clientRelations = relations(clientTable, ({ many }) => ({
  orders: many(orderTable),
}));

export const orderProductRelations = relations(orderProductTable, ({ one }) => ({
  order: one(orderTable, {
    fields: [orderProductTable.orderId],
    references: [orderTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [orderProductTable.productVariantId],
    references: [productVariantTable.id],
  }),
}));
