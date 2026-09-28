import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupplierOrderIssueSchema } from '@/modules/supplier-order/schemas/supplier-order-issue.schema';
import { reviewSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';
import { SupplierOrderIssueService } from '@/modules/supplier-order/supplier-order-issue.service';
import { SupplierOrderReceiptService } from '@/modules/supplier-order/supplier-order-receipt.service';
import { SupplierOrderReceiptReviewService } from '@/modules/supplier-order/supplier-order-receipt-review.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderProductTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new SupplierOrderIssueService();
const arrivals = new SupplierOrderReceiptService();
const reviews = new SupplierOrderReceiptReviewService();
let userId: string;
let orderId: string;
let lineId: string;
let receiptId: string;
let variantId: number;
let otherVariantId: number;
let code = 0;
beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Issue', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  const [order] = await db
    .insert(supplierOrderTable)
    .values({ supplierId: supplier.id, currency: 'PEN', supplierPaymentAmount: '100.000000', createdBy: userId })
    .returning();
  orderId = order.id;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      [0, 1].map(() => ({
        productId: product.id,
        code: String(++code).padStart(5, '0'),
        price: '100.000000',
        purchasePrice: '60.000000',
        createdBy: userId,
      })),
    )
    .returning();
  variantId = variants[0].id;
  otherVariantId = variants[1].id;
  const [line] = await db
    .insert(supplierOrderProductTable)
    .values({
      supplierOrderId: orderId,
      productVariantId: variantId,
      quantityOrdered: 10,
      unitPrice: '10.000000',
      createdBy: userId,
    })
    .returning();
  lineId = line.id;
  receiptId = (await arrivals.create(orderId, {}, userId)).id;
});
const create = (fields: Record<string, unknown>) =>
  service.create(
    orderId,
    createSupplierOrderIssueSchema.parse({ description: 'Incidencia verificada', quantity: 1, ...fields }),
    userId,
  );
const shortage = (quantity = 1) => create({ type: 'SHORTAGE', supplierOrderProductId: lineId, quantity });
const review = (items: Record<string, unknown>[]) =>
  reviews.review(
    orderId,
    receiptId,
    reviewSupplierOrderReceiptSchema.parse({ items, observation: 'Revisión completa' }),
    userId,
  );
const expected = (availableQuantity = 7, defectiveQuantity = 2) => ({
  supplierOrderProductId: lineId,
  availableQuantity,
  defectiveQuantity,
});
const wrong = (availableQuantity = 1, defectiveQuantity = 0) => ({
  productVariantId: otherVariantId,
  availableQuantity,
  defectiveQuantity,
});
async function finish(items: Record<string, unknown>[] = [expected()]) {
  const result = await review(items);
  await arrivals.closeReceiving(orderId, userId);
  return result.items;
}

describe('incidencias de compra', () => {
  it('suma las unidades de todos los paquetes al determinar los faltantes', async () => {
    await review([expected(4, 1)]);
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
    receiptId = (await arrivals.create(orderId, {}, userId)).id;
    await finish([expected(4, 0)]);
    await expect(shortage(2)).rejects.toMatchObject({ statusCode: 409 });
    expect(await shortage()).toMatchObject({ quantity: 1 });
  });
  it('no permite asociar una falla a una línea diferente del detalle recibido', async () => {
    const items = await finish([expected(), wrong(0, 1)]);
    const receiptItemId = items.find((item) => item.productVariantId === otherVariantId)?.id;
    await expect(create({ type: 'DEFECTIVE', receiptItemId, supplierOrderProductId: lineId })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('serializa los cierres concurrentes y conserva una sola resolución', async () => {
    await finish();
    const issue = await shortage();
    const results = await Promise.allSettled([
      service.close(orderId, issue.id, { resolutionNote: 'Crédito A' }, userId),
      service.close(orderId, issue.id, { resolutionNote: 'Crédito B' }, userId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
  it('reclama una unidad faltante de diez sin enlazar el detalle de las nueve recibidas', async () => {
    await finish();
    expect(await shortage()).toMatchObject({
      supplierOrderProductId: lineId,
      receiptItemId: null,
      quantity: 1,
      status: 'OPEN',
      createdBy: userId,
    });
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
  });
  it('permite reclamar una línea que no llegó en absoluto', async () => {
    await finish([wrong()]);
    expect(await shortage(10)).toMatchObject({ quantity: 10 });
  });
  it('espera el cierre y la revisión completa antes de reclamar faltantes', async () => {
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
    await arrivals.closeReceiving(orderId, userId);
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
    await review([expected()]);
    expect(await shortage()).toMatchObject({ quantity: 1 });
  });
  it('registra fallas antes del cierre y deriva la línea desde el detalle', async () => {
    const result = await review([expected()]);
    const receiptItemId = result.items[0].id;
    expect(await create({ type: 'DEFECTIVE', receiptItemId, quantity: 2 })).toMatchObject({
      supplierOrderProductId: lineId,
      receiptItemId,
      quantity: 2,
    });
    await expect(create({ type: 'DEFECTIVE', receiptItemId })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('comparte el límite faltante entre reclamos por faltantes y modelos equivocados', async () => {
    const items = await finish([expected(), wrong()]);
    const receiptItemId = items.find((item) => item.productVariantId === otherVariantId)?.id;
    expect(await create({ type: 'WRONG_PRODUCT', supplierOrderProductId: lineId, receiptItemId })).toMatchObject({
      receiptItemId,
      supplierOrderProductId: lineId,
    });
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
  });
  it('no reclama como modelo equivocado una línea comprada o el mismo modelo', async () => {
    const items = await finish([expected(), { productVariantId: variantId, availableQuantity: 1 }]);
    for (const item of items) {
      await expect(
        create({ type: 'WRONG_PRODUCT', supplierOrderProductId: lineId, receiptItemId: item.id }),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });
  it('limita los modelos equivocados por las unidades realmente recibidas', async () => {
    const items = await finish([expected(5, 0), wrong(1)]);
    const receiptItemId = items.find((item) => item.productVariantId === otherVariantId)?.id;
    await expect(
      create({ type: 'WRONG_PRODUCT', supplierOrderProductId: lineId, receiptItemId, quantity: 2 }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it('evita reclamar dos veces una unidad defectuosa y de modelo equivocado', async () => {
    const items = await finish([expected(), wrong(0, 1)]);
    const receiptItemId = items.find((item) => item.productVariantId === otherVariantId)?.id;
    expect(await create({ type: 'DEFECTIVE', receiptItemId })).toMatchObject({ supplierOrderProductId: null });
    await expect(
      create({ type: 'WRONG_PRODUCT', supplierOrderProductId: lineId, receiptItemId }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it('serializa dos reclamos concurrentes por la misma unidad faltante', async () => {
    await finish();
    const results = await Promise.allSettled([shortage(), shortage()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await service.getAll(orderId)).toHaveLength(1);
  });
  it('cierra con auditoría sin liberar unidades reclamables ni alterar inventario o precio', async () => {
    await finish();
    const issue = await shortage();
    expect(await service.close(orderId, issue.id, { resolutionNote: 'Crédito recibido' }, userId)).toMatchObject({
      status: 'CLOSED',
      closedBy: userId,
      closedAt: expect.any(Date),
      updatedBy: userId,
      resolutionNote: 'Crédito recibido',
    });
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.close(orderId, issue.id, { resolutionNote: 'Otra vez' }, userId)).rejects.toMatchObject({
      statusCode: 409,
    });
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
  it('rechaza referencias ajenas a la compra sin dejar incidencias parciales', async () => {
    await finish();
    await expect(create({ type: 'SHORTAGE', supplierOrderProductId: randomUUID() })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(create({ type: 'DEFECTIVE', receiptItemId: randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.close(orderId, randomUUID(), { resolutionNote: 'Crédito' }, userId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await service.getAll(orderId)).toHaveLength(0);
  });
  it('no registra incidencias nuevas en compras históricas', async () => {
    await finish();
    await db
      .update(supplierOrderTable)
      .set({ recordOrigin: 'LEGACY_IMPORT' })
      .where(eq(supplierOrderTable.id, orderId));
    await expect(shortage()).rejects.toMatchObject({ statusCode: 409 });
  });
});
