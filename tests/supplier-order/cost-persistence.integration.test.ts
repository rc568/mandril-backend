import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupplierOrderService } from '@/modules/supplier-order/supplier-order.service';
import { SupplierOrderCostService } from '@/modules/supplier-order/supplier-order-cost.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderExpenseTable,
  supplierOrderIssueTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new SupplierOrderCostService();
let userId: string;
let supplierId: string;
let variantId: number;
let orderId: string;
let lineId: string;
let code = 0;
beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Cost', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  supplierId = supplier.id;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const [variant] = await db
    .insert(productVariantTable)
    .values({
      productId: product.id,
      code: String(++code).padStart(5, '0'),
      price: '100.000000',
      purchasePrice: '60.000000',
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;
  const order = await createOrder();
  orderId = order.id;
  lineId = (await line(orderId)).id;
  await line(orderId, { quantityOrdered: 1, unitPrice: '20.000000' });
  await db.insert(supplierOrderExpenseTable).values({
    supplierOrderId: orderId,
    type: 'INTERNATIONAL_SHIPPING',
    amountUsd: '10.000000',
    amountPen: '35.000000',
    includedInSupplierPayment: true,
    createdBy: userId,
  });
});
async function createOrder() {
  const [order] = await db
    .insert(supplierOrderTable)
    .values({
      supplierId,
      status: 'RECEIVED',
      reviewStatus: 'COMPLETED',
      currency: 'USD',
      projectedExchangeRate: '3.400000',
      supplierPaymentAmount: '999.000000',
      createdBy: userId,
    })
    .returning();
  return order;
}
async function line(id: string, changes: Partial<typeof supplierOrderProductTable.$inferInsert> = {}) {
  const [result] = await db
    .insert(supplierOrderProductTable)
    .values({
      supplierOrderId: id,
      productVariantId: variantId,
      quantityOrdered: 2,
      unitPrice: '10.000000',
      createdBy: userId,
      ...changes,
    })
    .returning();
  return result;
}
async function receipt(id = orderId) {
  const [result] = await db
    .insert(supplierOrderReceiptTable)
    .values({
      supplierOrderId: id,
      sequenceNumber: 1,
      receivedAt: new Date(),
      receivedBy: userId,
      reviewStatus: 'COMPLETED',
      reviewedAt: new Date(),
      reviewedBy: userId,
      createdBy: userId,
    })
    .returning();
  return result;
}
async function item(receiptId: string, changes: Partial<typeof supplierOrderReceiptItemTable.$inferInsert> = {}) {
  const [result] = await db
    .insert(supplierOrderReceiptItemTable)
    .values({ receiptId, productVariantId: variantId, availableQuantity: 1, ...changes })
    .returning();
  return result;
}
async function sourceIssue(changes: Partial<typeof supplierOrderIssueTable.$inferInsert> = {}) {
  const [result] = await db
    .insert(supplierOrderIssueTable)
    .values({
      supplierOrderId: orderId,
      supplierOrderProductId: lineId,
      type: 'SHORTAGE',
      quantity: 2,
      description: 'Reclamo de prueba',
      createdBy: userId,
      ...changes,
    })
    .returning();
  return result;
}
const saved = () =>
  db.select().from(supplierOrderProductTable).where(eq(supplierOrderProductTable.supplierOrderId, orderId));
const resolve = (id: string, receiptId: string) =>
  db.transaction((tx) => service.resolveReceiptCosts(id, receiptId, tx));

describe('persistencia de costos finales', () => {
  it('guarda los costos en USD y PEN con auditoría sin contar dos veces el pago al proveedor', async () => {
    const costs = await service.calculateAndSave(orderId, userId);
    expect(costs).toEqual(
      expect.arrayContaining([
        { supplierOrderProductId: lineId, calculatedUnitCost: '14.750000', calculatedUnitCostPen: '50.150000' },
        expect.objectContaining({ calculatedUnitCost: '29.500000', calculatedUnitCostPen: '100.300000' }),
      ]),
    );
    expect((await saved()).every((product) => product.updatedBy === userId)).toBe(true);
    expect(await db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, orderId))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId)),
    ).toHaveLength(0);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ purchasePrice: '60.000000' });
  });
  it('usa el importe PEN del gasto sin exigir conversión en compras PEN', async () => {
    await db
      .update(supplierOrderTable)
      .set({ currency: 'PEN', projectedExchangeRate: null })
      .where(eq(supplierOrderTable.id, orderId));
    const costs = await service.calculateAndSave(orderId, userId);
    expect(costs.find((cost) => cost.supplierOrderProductId === lineId)).toMatchObject({
      calculatedUnitCost: '22.125000',
      calculatedUnitCostPen: '22.125000',
    });
  });
  it('permite definir el cambio después de revisar, pero no guarda costos parciales sin él', async () => {
    await db.update(supplierOrderTable).set({ projectedExchangeRate: null }).where(eq(supplierOrderTable.id, orderId));
    await expect(service.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    expect(
      (await saved()).every((product) => product.calculatedUnitCost === null && product.calculatedUnitCostPen === null),
    ).toBe(true);
    await new SupplierOrderService().updateProjectedExchangeRate(
      orderId,
      { projectedExchangeRate: '3.400000' },
      userId,
    );
    await service.calculateAndSave(orderId, userId);
  });
  it('no permite recalcular ni cambiar el tipo proyectado tras guardar', async () => {
    await service.calculateAndSave(orderId, userId);
    await expect(service.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      new SupplierOrderService().updateProjectedExchangeRate(orderId, { projectedExchangeRate: '4.000000' }, userId),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await saved()).find((product) => product.id === lineId)?.calculatedUnitCostPen).toBe('50.150000');
  });
  it('serializa dos cálculos concurrentes', async () => {
    const results = await Promise.allSettled([
      service.calculateAndSave(orderId, userId),
      service.calculateAndSave(orderId, userId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
  it.each(['PREPARING', 'IN_TRANSIT', 'CANCELLED'] as const)('rechaza guardar en estado %s', async (status) => {
    await db.update(supplierOrderTable).set({ status }).where(eq(supplierOrderTable.id, orderId));
    await expect(service.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('admite guardar desde la primera llegada sin exigir el cierre de todos los paquetes', async () => {
    await db
      .update(supplierOrderTable)
      .set({ status: 'PARTIALLY_RECEIVED', reviewStatus: 'PENDING' })
      .where(eq(supplierOrderTable.id, orderId));
    expect(await service.calculateAndSave(orderId, userId)).toHaveLength(2);
  });
  it.each([{ recordOrigin: 'LEGACY_IMPORT' as const }, { costCalculationVersion: 'FUTURE_V2' }])(
    'no recalcula históricos ni interpreta versiones desconocidas: %j',
    async (changes) => {
      await db.update(supplierOrderTable).set(changes).where(eq(supplierOrderTable.id, orderId));
      await expect(service.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    },
  );
  it('no guarda ninguna línea si falta un importe o una línea ya tiene costo', async () => {
    await db
      .update(supplierOrderExpenseTable)
      .set({ amountUsd: null })
      .where(eq(supplierOrderExpenseTable.supplierOrderId, orderId));
    await expect(service.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 400 });
    expect((await saved()).every((product) => product.calculatedUnitCostPen === null)).toBe(true);
    await db
      .update(supplierOrderProductTable)
      .set({ calculatedUnitCost: '1.000000' })
      .where(eq(supplierOrderProductTable.id, lineId));
    await expect(service.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('excluye las compensaciones del reparto y no inventa un costo común por línea', async () => {
    const compensation = await line(orderId, { type: 'COMPENSATION', unitPrice: '0.000000' });
    expect(await service.calculateAndSave(orderId, userId)).toHaveLength(2);
    expect((await saved()).find((product) => product.id === compensation.id)).toMatchObject({
      calculatedUnitCost: null,
      calculatedUnitCostPen: null,
    });
    const standalone = await createOrder();
    await line(standalone.id, { type: 'COMPENSATION', unitPrice: '0.000000' });
    await expect(service.calculateAndSave(standalone.id, userId)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('costos por detalle recibido', () => {
  it('bloquea un detalle comprado sin costo final y conserva el cero de un sobrante', async () => {
    const received = await receipt();
    const purchased = await item(received.id, { supplierOrderProductId: lineId });
    const surplus = await item(received.id, { unplannedUnitCostPen: '0.000000' });
    await expect(resolve(orderId, received.id)).rejects.toMatchObject({ statusCode: 409 });
    await service.calculateAndSave(orderId, userId);
    expect(await resolve(orderId, received.id)).toEqual(
      expect.arrayContaining([
        { receiptItemId: purchased.id, unitCostPen: '50.150000' },
        { receiptItemId: surplus.id, unitCostPen: '0.000000' },
      ]),
    );
  });
  it('resuelve dos costos originales distintos dentro de una misma línea compensatoria', async () => {
    await service.calculateAndSave(orderId, userId);
    const lines = await saved();
    const first = await sourceIssue();
    const second = await sourceIssue({ supplierOrderProductId: lines.find((product) => product.id !== lineId)?.id });
    const target = await createOrder();
    const compensation = await line(target.id, { type: 'COMPENSATION', unitPrice: '0.000000' });
    const received = await receipt(target.id);
    const a = await item(received.id, { supplierOrderProductId: compensation.id, sourceIssueId: first.id });
    const b = await item(received.id, { supplierOrderProductId: compensation.id, sourceIssueId: second.id });
    expect(await resolve(target.id, received.id)).toEqual(
      expect.arrayContaining([
        { receiptItemId: a.id, unitCostPen: '50.150000' },
        { receiptItemId: b.id, unitCostPen: '100.300000' },
      ]),
    );
  });
  it('conserva el costo original PEN aunque cambie la moneda o se cierre el reclamo', async () => {
    await service.calculateAndSave(orderId, userId);
    const issue = await sourceIssue({
      status: 'CLOSED',
      resolutionNote: 'Reemplazo revisado',
      closedAt: new Date(),
      closedBy: userId,
    });
    const target = await createOrder();
    await db
      .update(supplierOrderTable)
      .set({ currency: 'PEN', projectedExchangeRate: null })
      .where(eq(supplierOrderTable.id, target.id));
    const received = await receipt(target.id);
    const replacement = await item(received.id, { sourceIssueId: issue.id });
    expect(await resolve(target.id, received.id)).toEqual([
      { receiptItemId: replacement.id, unitCostPen: '50.150000' },
    ]);
  });
  it('hereda el costo del modelo solicitado cuando se recibió otro modelo a costo cero', async () => {
    await service.calculateAndSave(orderId, userId);
    const originalReceipt = await receipt();
    const wrongItem = await item(originalReceipt.id, { unplannedUnitCostPen: '0.000000' });
    const issue = await sourceIssue({ type: 'WRONG_PRODUCT', receiptItemId: wrongItem.id });
    const target = await createOrder();
    const received = await receipt(target.id);
    const replacement = await item(received.id, { sourceIssueId: issue.id });
    expect(await resolve(target.id, received.id)).toEqual([
      { receiptItemId: replacement.id, unitCostPen: '50.150000' },
    ]);
  });
  it('resuelve el costo de una compensación que a su vez llegó defectuosa', async () => {
    await service.calculateAndSave(orderId, userId);
    const original = await sourceIssue();
    const target = await createOrder();
    const received = await receipt(target.id);
    const failedReplacement = await item(received.id, {
      sourceIssueId: original.id,
      availableQuantity: 0,
      defectiveQuantity: 1,
    });
    const nextIssue = await sourceIssue({
      supplierOrderId: target.id,
      supplierOrderProductId: null,
      type: 'DEFECTIVE',
      receiptItemId: failedReplacement.id,
    });
    const next = await createOrder();
    const nextReceipt = await receipt(next.id);
    const replacement = await item(nextReceipt.id, { sourceIssueId: nextIssue.id });
    expect(await resolve(next.id, nextReceipt.id)).toEqual([
      { receiptItemId: replacement.id, unitCostPen: '50.150000' },
    ]);
  });
  it('no inventa el costo de origen desconocido de una compensación', async () => {
    const issue = await sourceIssue();
    const target = await createOrder();
    const received = await receipt(target.id);
    await item(received.id, { sourceIssueId: issue.id });
    await expect(resolve(target.id, received.id)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('detecta referencias circulares sin recursión indefinida', async () => {
    const received = await receipt();
    const defective = await item(received.id, { availableQuantity: 0, defectiveQuantity: 1 });
    const issue = await sourceIssue({ type: 'DEFECTIVE', receiptItemId: defective.id, supplierOrderProductId: null });
    await db
      .update(supplierOrderReceiptItemTable)
      .set({ sourceIssueId: issue.id })
      .where(eq(supplierOrderReceiptItemTable.id, defective.id));
    await expect(resolve(orderId, received.id)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('exige una recepción revisada que pertenezca a la compra', async () => {
    const received = await receipt();
    const other = await createOrder();
    await expect(resolve(other.id, received.id)).rejects.toMatchObject({ statusCode: 404 });
    await db
      .update(supplierOrderReceiptTable)
      .set({ reviewStatus: 'PENDING', reviewedAt: null, reviewedBy: null })
      .where(eq(supplierOrderReceiptTable.id, received.id));
    await expect(resolve(orderId, received.id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
