import { relations, type SQL, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
  uniqueIndex,
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
export const supplierOrderReceiptReviewStatusEnum = pgEnum('supplier_order_receipt_review_status', [
  'PENDING',
  'COMPLETED',
]);
export const supplierOrderIssueTypeEnum = pgEnum('supplier_order_issue_type', [
  'SHORTAGE',
  'DEFECTIVE',
  'WRONG_PRODUCT',
]);
export const supplierOrderIssueStatusEnum = pgEnum('supplier_order_issue_status', ['OPEN', 'CLOSED']);

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

export const supplierOrderReceiptTable = pgTable(
  'supplier_order_receipt',
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrderId: uuid()
      .references(() => supplierOrderTable.id)
      .notNull(),
    packageNumber: integer().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    receivedBy: uuid()
      .references(() => userTable.id)
      .notNull(),
    reviewStatus: supplierOrderReceiptReviewStatusEnum().default('PENDING').notNull(),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewedBy: uuid().references(() => userTable.id),
    observation: text(),
    ...updateAudit,
  },
  (t) => [
    uniqueIndex('supplier_order_receipt_package_idx').on(t.supplierOrderId, t.packageNumber),
    check('supplier_order_receipt_package_number_check', sql`${t.packageNumber} > 0`),
    check(
      'supplier_order_receipt_review_check',
      sql`
      (${t.reviewStatus} = 'PENDING' AND ${t.reviewedAt} IS NULL AND ${t.reviewedBy} IS NULL)
      OR (${t.reviewStatus} = 'COMPLETED' AND ${t.reviewedAt} IS NOT NULL AND ${t.reviewedBy} IS NOT NULL)
    `,
    ),
  ],
);

export const supplierOrderReceiptItemTable = pgTable(
  'supplier_order_receipt_item',
  {
    id: uuid().defaultRandom().primaryKey(),
    receiptId: uuid()
      .references(() => supplierOrderReceiptTable.id)
      .notNull(),
    supplierOrderProductId: uuid().references(() => supplierOrderProductTable.id),
    // En una entrada prevista, el servicio copia la variante de la línea de compra.
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    availableQuantity: integer().default(0).notNull(),
    defectiveQuantity: integer().default(0).notNull(),
    // Incidencia anterior que estas unidades compensan; no la que originan.
    sourceIssueId: uuid().references((): AnyPgColumn => supplierOrderIssueTable.id),
    // Entradas libres: cero para sobrantes/modelos equivocados; compensaciones usan su origen.
    unplannedUnitCostPen: decimal({ precision: 18, scale: 6 }),
    observation: text(),
  },
  (t) => [
    index('supplier_order_receipt_item_receipt_idx').on(t.receiptId),
    index('supplier_order_receipt_item_product_idx').on(t.supplierOrderProductId),
    index('supplier_order_receipt_item_variant_idx').on(t.productVariantId),
    index('supplier_order_receipt_item_source_issue_idx').on(t.sourceIssueId),
    check('supplier_order_receipt_item_available_check', sql`${t.availableQuantity} >= 0`),
    check('supplier_order_receipt_item_defective_check', sql`${t.defectiveQuantity} >= 0`),
    check('supplier_order_receipt_item_quantity_check', sql`${t.availableQuantity} > 0 OR ${t.defectiveQuantity} > 0`),
    check('supplier_order_receipt_item_cost_check', sql`${t.unplannedUnitCostPen} >= 0`),
    check(
      'supplier_order_receipt_item_unplanned_cost_check',
      sql`${t.supplierOrderProductId} IS NULL OR ${t.unplannedUnitCostPen} IS NULL`,
    ),
  ],
);

export const supplierOrderIssueTable = pgTable(
  'supplier_order_issue',
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrderId: uuid()
      .references(() => supplierOrderTable.id)
      .notNull(),
    supplierOrderProductId: uuid().references(() => supplierOrderProductTable.id),
    // Detalle donde se detectó el problema, distinto de las recepciones compensatorias.
    receiptItemId: uuid().references((): AnyPgColumn => supplierOrderReceiptItemTable.id),
    type: supplierOrderIssueTypeEnum().notNull(),
    quantity: integer().notNull(),
    status: supplierOrderIssueStatusEnum().default('OPEN').notNull(),
    description: text().notNull(),
    resolutionNote: text(),
    closedAt: timestamp({ withTimezone: true }),
    closedBy: uuid().references(() => userTable.id),
    ...updateAudit,
  },
  (t) => [
    index('supplier_order_issue_order_idx').on(t.supplierOrderId),
    index('supplier_order_issue_product_idx').on(t.supplierOrderProductId),
    index('supplier_order_issue_receipt_item_idx').on(t.receiptItemId),
    check('supplier_order_issue_quantity_check', sql`${t.quantity} > 0`),
    check('supplier_order_issue_description_check', sql`length(trim(${t.description})) > 0`),
    check(
      'supplier_order_issue_source_check',
      sql`
      (${t.type} = 'SHORTAGE' AND ${t.supplierOrderProductId} IS NOT NULL AND ${t.receiptItemId} IS NULL)
      OR (${t.type} = 'DEFECTIVE' AND ${t.receiptItemId} IS NOT NULL)
      OR (${t.type} = 'WRONG_PRODUCT' AND ${t.supplierOrderProductId} IS NOT NULL AND ${t.receiptItemId} IS NOT NULL)
    `,
    ),
    check(
      'supplier_order_issue_closure_check',
      sql`
      (${t.status} = 'OPEN' AND ${t.closedAt} IS NULL AND ${t.closedBy} IS NULL)
      OR (${t.status} = 'CLOSED' AND ${t.closedAt} IS NOT NULL AND ${t.closedBy} IS NOT NULL
        AND ${t.resolutionNote} IS NOT NULL AND length(trim(${t.resolutionNote})) > 0)
    `,
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
  receipts: many(supplierOrderReceiptTable),
  issues: many(supplierOrderIssueTable),
  supplier: one(supplierTable, {
    fields: [supplierOrderTable.supplierId],
    references: [supplierTable.id],
  }),
}));

export const supplierOrderProductRelations = relations(supplierOrderProductTable, ({ one, many }) => ({
  receiptItems: many(supplierOrderReceiptItemTable),
  issues: many(supplierOrderIssueTable),
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

export const supplierOrderReceiptRelations = relations(supplierOrderReceiptTable, ({ one, many }) => ({
  supplierOrder: one(supplierOrderTable, {
    fields: [supplierOrderReceiptTable.supplierOrderId],
    references: [supplierOrderTable.id],
  }),
  items: many(supplierOrderReceiptItemTable),
}));

export const supplierOrderReceiptItemRelations = relations(supplierOrderReceiptItemTable, ({ one, many }) => ({
  receipt: one(supplierOrderReceiptTable, {
    fields: [supplierOrderReceiptItemTable.receiptId],
    references: [supplierOrderReceiptTable.id],
  }),
  supplierOrderProduct: one(supplierOrderProductTable, {
    fields: [supplierOrderReceiptItemTable.supplierOrderProductId],
    references: [supplierOrderProductTable.id],
  }),
  productVariant: one(productVariantTable, {
    fields: [supplierOrderReceiptItemTable.productVariantId],
    references: [productVariantTable.id],
  }),
  sourceIssue: one(supplierOrderIssueTable, {
    fields: [supplierOrderReceiptItemTable.sourceIssueId],
    references: [supplierOrderIssueTable.id],
    relationName: 'issueCompensations',
  }),
  issues: many(supplierOrderIssueTable, { relationName: 'receiptItemIssues' }),
}));

export const supplierOrderIssueRelations = relations(supplierOrderIssueTable, ({ one, many }) => ({
  supplierOrder: one(supplierOrderTable, {
    fields: [supplierOrderIssueTable.supplierOrderId],
    references: [supplierOrderTable.id],
  }),
  supplierOrderProduct: one(supplierOrderProductTable, {
    fields: [supplierOrderIssueTable.supplierOrderProductId],
    references: [supplierOrderProductTable.id],
  }),
  receiptItem: one(supplierOrderReceiptItemTable, {
    fields: [supplierOrderIssueTable.receiptItemId],
    references: [supplierOrderReceiptItemTable.id],
    relationName: 'receiptItemIssues',
  }),
  compensationItems: many(supplierOrderReceiptItemTable, { relationName: 'issueCompensations' }),
}));
