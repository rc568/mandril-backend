import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { productVariantTable } from './product.schema';
import { updateAudit } from './shared';
import { userTable } from './user.schema';

export const supplierOrderStatusEnum = pgEnum('supplier_order_status', [
  'PREPARING',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
export const supplierOrderTypeEnum = pgEnum('supplier_order_type', ['PURCHASE', 'COMPENSATION']);
export const supplierOrderReviewStatusEnum = pgEnum('supplier_order_review_status', [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
]);
export const supplierOrderRecordOriginEnum = pgEnum('supplier_order_record_origin', ['SYSTEM', 'LEGACY_IMPORT']);
export const supplierOrderCurrencyEnum = pgEnum('supplier_order_currency', ['PEN', 'USD']);
export const supplierOrderExpenseTypeEnum = pgEnum('supplier_order_expense_type', [
  'INTERNATIONAL_SHIPPING',
  'CUSTOMS_TAXES',
  'LOCAL_FREIGHT',
  'OTHER',
]);

export const supplierTable = pgTable('supplier', {
  id: uuid().defaultRandom().primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  isActive: boolean().default(true).notNull(),
  ...updateAudit,
});

export const supplierOrderTable = pgTable(
  'supplier_order',
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierId: uuid()
      .references(() => supplierTable.id)
      .notNull(),
    type: supplierOrderTypeEnum().default('PURCHASE').notNull(),
    status: supplierOrderStatusEnum().default('PREPARING').notNull(),
    // NULL permite conservar un historial cuyo estado de revisión se desconoce.
    reviewStatus: supplierOrderReviewStatusEnum().default('PENDING'),
    recordOrigin: supplierOrderRecordOriginEnum().default('SYSTEM').notNull(),
    trackingNumber: varchar({ length: 255 }),
    importPolicy: varchar({ length: 255 }),
    // La fecha histórica de llegada no implica conocer una hora de recepción.
    arrivalDate: date(),
    currency: supplierOrderCurrencyEnum(),
    // Incluye productos y gastos marcados como incluidos en el pago al proveedor.
    supplierPaymentAmount: decimal({ precision: 18, scale: 6 }),
    supplierPaymentAmountPen: decimal({ precision: 18, scale: 6 }),
    costCalculationVersion: varchar({ length: 50 }).default('LEGACY_V1').notNull(),
    observation: text(),
    receivingClosedAt: timestamp({ withTimezone: true }),
    receivingClosedBy: uuid().references(() => userTable.id),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_supplier_idx').on(t.supplierId),
    check('supplier_order_payment_amount_check', sql`${t.supplierPaymentAmount} >= 0`),
    check('supplier_order_payment_pen_check', sql`${t.supplierPaymentAmountPen} >= 0`),
    check(
      'supplier_order_payment_currency_check',
      sql`${t.supplierPaymentAmount} IS NULL OR ${t.currency} IS NOT NULL`,
    ),
    check(
      'supplier_order_pen_payment_check',
      sql`${t.currency} <> 'PEN' OR ${t.supplierPaymentAmountPen} = ${t.supplierPaymentAmount}`,
    ),
  ],
);

export const supplierOrderProductTable = pgTable(
  'supplier_order_product',
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrderId: uuid()
      .references(() => supplierOrderTable.id)
      .notNull(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    type: supplierOrderTypeEnum().default('PURCHASE').notNull(),
    quantityOrdered: integer().notNull(),
    // NULL significa desconocido; cero representa un producto sin nuevo cobro.
    unitPrice: decimal({ precision: 18, scale: 6 }),
    calculatedUnitCostPen: decimal({ precision: 18, scale: 6 }),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_product_order_idx').on(t.supplierOrderId),
    index('supplier_order_product_variant_idx').on(t.productVariantId),
    check('supplier_order_product_quantity_check', sql`${t.quantityOrdered} > 0`),
    check('supplier_order_product_price_check', sql`${t.unitPrice} >= 0`),
    check('supplier_order_product_cost_check', sql`${t.calculatedUnitCostPen} >= 0`),
    check(
      'supplier_order_product_compensation_price_check',
      sql`${t.type} <> 'COMPENSATION' OR (${t.unitPrice} IS NOT NULL AND ${t.unitPrice} = 0)`,
    ),
  ],
);

export const supplierOrderExpenseTable = pgTable(
  'supplier_order_expense',
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrderId: uuid()
      .references(() => supplierOrderTable.id)
      .notNull(),
    type: supplierOrderExpenseTypeEnum().notNull(),
    description: text(),
    amount: decimal({ precision: 18, scale: 6 }).notNull(),
    currency: supplierOrderCurrencyEnum().notNull(),
    includedInSupplierPayment: boolean().default(false).notNull(),
    // Para pagos independientes; los incluidos usan el equivalente del pago conjunto.
    paidAmountPen: decimal({ precision: 18, scale: 6 }),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_expense_order_idx').on(t.supplierOrderId),
    check('supplier_order_expense_amount_check', sql`${t.amount} > 0`),
    check('supplier_order_expense_paid_amount_check', sql`${t.paidAmountPen} >= 0`),
    check(
      'supplier_order_expense_other_description_check',
      sql`${t.type} <> 'OTHER' OR (${t.description} IS NOT NULL AND length(trim(${t.description})) > 0)`,
    ),
    check(
      'supplier_order_expense_included_payment_check',
      sql`NOT ${t.includedInSupplierPayment} OR ${t.paidAmountPen} IS NULL`,
    ),
    check('supplier_order_expense_pen_payment_check', sql`${t.currency} <> 'PEN' OR ${t.paidAmountPen} = ${t.amount}`),
  ],
);

// ORM RELATIONS

export const supplierRelations = relations(supplierTable, ({ many }) => ({
  orders: many(supplierOrderTable),
}));

export const supplierOrderRelations = relations(supplierOrderTable, ({ many, one }) => ({
  products: many(supplierOrderProductTable),
  expenses: many(supplierOrderExpenseTable),
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

export const supplierOrderExpenseRelations = relations(supplierOrderExpenseTable, ({ one }) => ({
  supplierOrder: one(supplierOrderTable, {
    fields: [supplierOrderExpenseTable.supplierOrderId],
    references: [supplierOrderTable.id],
  }),
}));
