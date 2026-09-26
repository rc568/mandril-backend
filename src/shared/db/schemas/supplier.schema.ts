import { relations, type SQL, sql } from 'drizzle-orm';
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
    arrivalDateLegacy: date(),
    currency: supplierOrderCurrencyEnum(),
    // Incluye productos y gastos marcados como incluidos en el pago al proveedor.
    supplierPaymentAmount: decimal({ precision: 18, scale: 6 }),
    // Soles por dólar para convertir el costo final; no es el cambio de cada gasto.
    projectedExchangeRate: decimal({ precision: 18, scale: 6 }),
    costCalculationVersion: varchar({ length: 50 }).default('LEGACY_V1').notNull(),
    observation: text(),
    receivingClosedAt: timestamp({ withTimezone: true }),
    receivingClosedBy: uuid().references(() => userTable.id),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_supplier_idx').on(t.supplierId),
    check('supplier_order_payment_amount_check', sql`${t.supplierPaymentAmount} >= 0`),
    check('supplier_order_projected_exchange_rate_check', sql`${t.projectedExchangeRate} > 0`),
    check(
      'supplier_order_payment_currency_check',
      sql`${t.supplierPaymentAmount} IS NULL OR ${t.currency} IS NOT NULL`,
    ),
    check(
      'supplier_order_legacy_arrival_date_check',
      sql`${t.recordOrigin} = 'LEGACY_IMPORT' OR ${t.arrivalDateLegacy} IS NULL`,
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
    subtotalPrice: decimal({ precision: 18, scale: 6 }).generatedAlwaysAs(
      (): SQL => sql`${supplierOrderProductTable.quantityOrdered} * ${supplierOrderProductTable.unitPrice}`,
    ),
    // Costo final en la moneda de la orden y su equivalente en soles.
    calculatedUnitCost: decimal({ precision: 18, scale: 6 }),
    calculatedUnitCostPen: decimal({ precision: 18, scale: 6 }),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_product_order_idx').on(t.supplierOrderId),
    index('supplier_order_product_variant_idx').on(t.productVariantId),
    check('supplier_order_product_quantity_check', sql`${t.quantityOrdered} > 0`),
    check('supplier_order_product_price_check', sql`${t.unitPrice} >= 0`),
    check('supplier_order_product_cost_check', sql`${t.calculatedUnitCostPen} >= 0`),
    check('supplier_order_product_currency_cost_check', sql`${t.calculatedUnitCost} >= 0`),
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
    // Importes registrados por el encargado; no se convierten con el cambio proyectado.
    // Un equivalente todavía desconocido se conserva como NULL, no como cero.
    amountUsd: decimal({ precision: 18, scale: 6 }),
    amountPen: decimal({ precision: 18, scale: 6 }),
    includedInSupplierPayment: boolean().default(false).notNull(),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_expense_order_idx').on(t.supplierOrderId),
    check('supplier_order_expense_usd_amount_check', sql`${t.amountUsd} > 0`),
    check('supplier_order_expense_pen_amount_check', sql`${t.amountPen} > 0`),
    check(
      'supplier_order_expense_amount_required_check',
      sql`${t.amountUsd} IS NOT NULL OR ${t.amountPen} IS NOT NULL`,
    ),
    check(
      'supplier_order_expense_other_description_check',
      sql`${t.type} <> 'OTHER' OR (${t.description} IS NOT NULL AND length(trim(${t.description})) > 0)`,
    ),
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
