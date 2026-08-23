import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import { ORDER_PRODUCT_TYPE, ORDER_STATUS, ORDER_TYPE } from '@/modules/order';
import { BILLING_STATUS, CLIENT_DOCUMENT_NUMBER_TYPE, DOCUMENT_NUMBER_TYPE, RECEIPT_TYPE } from '@/shared/domain';
import { softDelete, timestamps } from '../utils/drizzle-columns';
import { productVariantTable } from './product.schema';
import { userAudit } from './shared';

export const orderStatusEnum = pgEnum('order_status', ORDER_STATUS);
export const orderTypeEnum = pgEnum('order_type', ORDER_TYPE);
export const orderProductTypeEnum = pgEnum('order_product_type', ORDER_PRODUCT_TYPE);
export const billingStatusEnum = pgEnum('billing_status', BILLING_STATUS);
export const receiptTypeEnum = pgEnum('receipt_type', RECEIPT_TYPE);
export const documentNumberTypeEnum = pgEnum('document_number_type', DOCUMENT_NUMBER_TYPE);
export const documentClientNumberTypeEnum = pgEnum('document_client_number_type', CLIENT_DOCUMENT_NUMBER_TYPE);

export const orderTable = pgTable('order', {
  id: uuid().defaultRandom().primaryKey(),
  type: orderTypeEnum().notNull().default('SALE'),
  relatedOrderId: uuid().references((): AnyPgColumn => orderTable.id),
  salesChannelId: smallint()
    .references(() => salesChannelTable.id)
    .notNull(),
  clientId: uuid()
    .references(() => clientTable.id)
    .notNull(),
  status: orderStatusEnum().notNull().default('PAID'),
  totalSale: decimal({ precision: 12, scale: 6 }).notNull(),
  totalCost: decimal({ precision: 12, scale: 6 }).notNull(),
  numProducts: integer().notNull(),
  observation: text(),
  ...softDelete,
  ...userAudit,
});

export const salesChannelTable = pgTable('sales_channel', {
  id: smallserial().primaryKey(),
  channel: varchar({ length: 25 }).notNull().unique(),
  ...softDelete,
  ...userAudit,
});

export const clientTable = pgTable('client', {
  id: uuid().defaultRandom().primaryKey(),
  documentNumberType: documentClientNumberTypeEnum(),
  documentNumber: varchar({ length: 25 }),
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
    type: orderProductTypeEnum().notNull().default('SALE'),
    price: decimal({ precision: 12, scale: 6 }).notNull(),
    quantity: integer().notNull(),
    purchasePrice: decimal({ precision: 12, scale: 6 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.productVariantId, t.type] })],
);

export const billingOrdersTable = pgTable('billing_orders', {
  id: uuid().defaultRandom().primaryKey(),
  orderId: uuid()
    .references(() => orderTable.id)
    .notNull(),
  code: varchar({ length: 50 }),
  amount: decimal({ precision: 12, scale: 6 }),
  status: billingStatusEnum().notNull().default('PENDING'),
  billingReceiptType: receiptTypeEnum().notNull(),
  billingDocumentNumberType: documentNumberTypeEnum().notNull(),
  billingDocumentNumber: varchar({ length: 25 }),
  billingName: varchar({ length: 255 }).notNull(),
  billingAddress: varchar({ length: 255 }),
  note: text(),
  ...softDelete,
  ...userAudit,
});

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
