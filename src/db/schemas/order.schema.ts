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
import { CLIENT_DOCUMENT_TYPE, INVOICE_TYPE, ORDER_STATUS } from '../../domain/order';
import { softDelete, timestamps } from '../helpers/columns.helpers';
import { productVariantTable } from './product.schema';
import { userAudit } from './shared';

export const invoiceTypeEnum = pgEnum('invoice_type', INVOICE_TYPE);
export const documentTypeEnum = pgEnum('document_type', CLIENT_DOCUMENT_TYPE);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUS);

export const orderTable = pgTable('order', {
  id: uuid().primaryKey(),
  salesChannelId: smallint().references(() => salesChannelTable.id),
  invoiceType: invoiceTypeEnum().default('SIN COMPROBANTE'),
  invoiceCode: varchar({ length: 50 }),
  clientId: uuid().references(() => clientTable.id),
  status: orderStatusEnum().notNull().default('PAID'),
  totalSale: decimal({ precision: 12, scale: 6 }).notNull(),
  numProducts: integer().notNull(),
  observation: text(),
  ...softDelete,
  ...userAudit,
});

export const salesChannelTable = pgTable('sales_channel', {
  id: smallserial().primaryKey(),
  channel: varchar({ length: 25 }).notNull(),
  ...softDelete,
  ...userAudit,
});

export const clientTable = pgTable('client', {
  id: uuid().primaryKey(),
  documentType: documentTypeEnum().default('SIN DOCUMENTO'),
  documentNumber: varchar({ length: 25 }),
  bussinessName: varchar({ length: 255 }),
  contactName: varchar({ length: 255 }),
  email: varchar({ length: 255 }),
  phoneNumber1: varchar({ length: 25 }),
  phoneNumber2: varchar({ length: 25 }),
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

export const clientRelations = relations(clientTable, ({ one }) => ({
  orders: one(orderTable),
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
