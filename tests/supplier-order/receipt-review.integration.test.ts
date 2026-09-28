import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reviewSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';
import { SupplierOrderReceiptService } from '@/modules/supplier-order/supplier-order-receipt.service';
import { SupplierOrderReceiptReviewService } from '@/modules/supplier-order/supplier-order-receipt-review.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
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

const service = new SupplierOrderReceiptReviewService();
const arrivals = new SupplierOrderReceiptService();
let userId: string;
let supplierId: string;
let orderId: string;
let receiptId: string;
let lineId: string;
let variantId: number;
let otherVariantId: number;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Review',
      lastName: 'Test',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  supplierId = supplier.id;
  const [order] = await db
    .insert(supplierOrderTable)
    .values({
      supplierId,
      currency: 'USD',
      supplierPaymentAmount: '100.000000',
      createdBy: userId,
    })
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
        quantityInStock: 7,
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
const review = (items: Record<string, unknown>[], observation?: string | null) =>
  service.review(orderId, receiptId, reviewSupplierOrderReceiptSchema.parse({ items, observation }), userId);
const expected = (availableQuantity = 8, defectiveQuantity = 2) => ({
  supplierOrderProductId: lineId,
  availableQuantity,
  defectiveQuantity,
});
const items = () =>
  db.select().from(supplierOrderReceiptItemTable).where(eq(supplierOrderReceiptItemTable.receiptId, receiptId));
const receipt = () =>
  db.query.supplierOrderReceiptTable.findFirst({ where: eq(supplierOrderReceiptTable.id, receiptId) });
const order = () => db.query.supplierOrderTable.findFirst({ where: eq(supplierOrderTable.id, orderId) });

async function issue() {
  const [original] = await db
    .insert(supplierOrderTable)
    .values({ supplierId, status: 'RECEIVED', createdBy: userId })
    .returning();
  const [line] = await db
    .insert(supplierOrderProductTable)
    .values({
      supplierOrderId: original.id,
      productVariantId: variantId,
      quantityOrdered: 2,
      unitPrice: '10.000000',
      createdBy: userId,
    })
    .returning();
  const [source] = await db
    .insert(supplierOrderIssueTable)
    .values({
      supplierOrderId: original.id,
      supplierOrderProductId: line.id,
      type: 'SHORTAGE',
      quantity: 2,
      description: 'Faltaron unidades',
      createdBy: userId,
    })
    .returning();
  return source;
}

describe('revisión completa de paquetes', () => {
  it.each(['DEFECTIVE', 'WRONG_PRODUCT'] as const)(
    'identifica la variante reclamada en incidencias %s',
    async (type) => {
      const source = await issue();
      const [originalReceipt] = await db
        .insert(supplierOrderReceiptTable)
        .values({
          supplierOrderId: source.supplierOrderId,
          sequenceNumber: 1,
          receivedAt: new Date(),
          receivedBy: userId,
          createdBy: userId,
          reviewStatus: 'COMPLETED',
          reviewedAt: new Date(),
          reviewedBy: userId,
        })
        .returning();
      const [wrongItem] = await db
        .insert(supplierOrderReceiptItemTable)
        .values({
          receiptId: originalReceipt.id,
          productVariantId: otherVariantId,
          defectiveQuantity: 2,
        })
        .returning();
      await db
        .update(supplierOrderIssueTable)
        .set({ type, receiptItemId: wrongItem.id })
        .where(eq(supplierOrderIssueTable.id, source.id));
      const expectedVariant = type === 'DEFECTIVE' ? otherVariantId : variantId;
      const result = await review([
        { productVariantId: expectedVariant, availableQuantity: 2, sourceIssueId: source.id },
      ]);
      expect(result.items[0].productVariantId).toBe(expectedVariant);
    },
  );

  it('serializa compensaciones de una incidencia en compras diferentes', async () => {
    const source = await issue();
    const [otherOrder] = await db
      .insert(supplierOrderTable)
      .values({
        supplierId,
        currency: 'USD',
        supplierPaymentAmount: '100.000000',
        createdBy: userId,
      })
      .returning();
    const otherReceipt = await arrivals.create(otherOrder.id, {}, userId);
    const dto = reviewSupplierOrderReceiptSchema.parse({
      items: [{ productVariantId: variantId, availableQuantity: 2, sourceIssueId: source.id }],
    });
    const results = await Promise.allSettled([
      service.review(orderId, receiptId, dto, userId),
      service.review(otherOrder.id, otherReceipt.id, dto, userId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
  });
  it('resuelve la variante desde la línea y registra revisión sin modificar inventario ni costos', async () => {
    const result = await review([expected()]);
    expect(result).toMatchObject({ reviewStatus: 'COMPLETED', reviewedBy: userId, updatedBy: userId });
    expect(result.reviewedAt).toBeInstanceOf(Date);
    expect(result.items[0]).toMatchObject({
      supplierOrderProductId: lineId,
      productVariantId: variantId,
      availableQuantity: 8,
      defectiveQuantity: 2,
      unplannedUnitCostPen: null,
    });
    expect(await order()).toMatchObject({
      reviewStatus: 'COMPLETED',
      status: 'PARTIALLY_RECEIVED',
      projectedExchangeRate: null,
    });
    expect(await db.select().from(inventoryBalanceTable)).toEqual([]);
    expect(await db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, orderId))).toEqual([]);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ quantityInStock: 7, purchasePrice: '60.000000' });
  });

  it('no permite repetir ni reemplazar una revisión completada', async () => {
    await review([expected()]);
    const before = await items();
    await expect(review([expected(1, 0)])).rejects.toMatchObject({ statusCode: 409 });
    expect(await items()).toEqual(before);
  });

  it('serializa revisiones simultáneas del mismo paquete', async () => {
    const results = await Promise.allSettled([review([expected()]), review([expected()])]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await items()).toHaveLength(1);
  });

  it('suma líneas repetidas del mismo paquete antes de comprobar el límite comprado', async () => {
    await expect(review([expected(6, 0), expected(5, 0)])).rejects.toMatchObject({ statusCode: 409 });
    expect(await items()).toEqual([]);
    await review([expected(6, 0), expected(4, 0)]);
    expect(await items()).toHaveLength(2);
  });

  it('controla el acumulado de paquetes concurrentes y el estado agregado de revisión', async () => {
    const second = await arrivals.create(orderId, {}, userId);
    const dto = reviewSupplierOrderReceiptSchema.parse({ items: [expected(6, 0)] });
    const results = await Promise.allSettled([
      service.review(orderId, receiptId, dto, userId),
      service.review(orderId, second.id, dto, userId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    expect(await order()).toMatchObject({ reviewStatus: 'IN_PROGRESS' });
    const pending = (await arrivals.getAll(orderId)).find((r) => r.reviewStatus === 'PENDING');
    if (!pending) throw new Error('Missing pending receipt');
    await service.review(
      orderId,
      pending.id,
      reviewSupplierOrderReceiptSchema.parse({ items: [expected(4, 0)] }),
      userId,
    );
    expect(await order()).toMatchObject({ reviewStatus: 'COMPLETED' });
  });

  it('admite revisión después de cerrar la llegada de paquetes', async () => {
    await arrivals.closeReceiving(orderId, userId);
    await review([expected()]);
    expect(await order()).toMatchObject({ status: 'RECEIVED', reviewStatus: 'COMPLETED' });
  });

  it('acepta sobrantes y modelos equivocados separados con costo cero', async () => {
    const result = await review(
      [
        expected(),
        { productVariantId: variantId, availableQuantity: 1 },
        { productVariantId: otherVariantId, availableQuantity: 2 },
      ],
      'Llegaron unidades adicionales y otro modelo',
    );
    expect(result.items.filter((item) => item.supplierOrderProductId === null)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productVariantId: variantId, unplannedUnitCostPen: '0.000000' }),
        expect.objectContaining({ productVariantId: otherVariantId, unplannedUnitCostPen: '0.000000' }),
      ]),
    );
  });

  it('exige observación para entradas no previstas y no permite borrar la única explicación', async () => {
    await expect(review([{ productVariantId: otherVariantId, availableQuantity: 1 }])).rejects.toMatchObject({
      statusCode: 400,
    });
    await db
      .update(supplierOrderReceiptTable)
      .set({ observation: 'Modelo distinto' })
      .where(eq(supplierOrderReceiptTable.id, receiptId));
    await expect(review([{ productVariantId: otherVariantId, availableQuantity: 1 }], null)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect((await review([{ productVariantId: otherVariantId, availableQuantity: 1 }])).observation).toBe(
      'Modelo distinto',
    );
  });

  it('rechaza líneas ajenas, variantes inconsistentes o eliminadas', async () => {
    await expect(review([{ supplierOrderProductId: randomUUID(), availableQuantity: 1 }])).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(review([{ ...expected(), productVariantId: otherVariantId }])).rejects.toMatchObject({
      statusCode: 400,
    });
    await db.update(productVariantTable).set({ deletedAt: new Date() }).where(eq(productVariantTable.id, variantId));
    await expect(review([expected()])).rejects.toMatchObject({ statusCode: 404 });
    expect(await items()).toEqual([]);
  });

  it('vincula una compensación prevista a su incidencia y deja el costo pendiente', async () => {
    const source = await issue();
    await db
      .update(supplierOrderProductTable)
      .set({ type: 'COMPENSATION', unitPrice: '0.000000' })
      .where(eq(supplierOrderProductTable.id, lineId));
    await expect(review([expected(2, 0)])).rejects.toMatchObject({ statusCode: 400 });
    const result = await review([{ ...expected(2, 0), sourceIssueId: source.id }]);
    expect(result.items[0]).toMatchObject({ sourceIssueId: source.id, unplannedUnitCostPen: null });
    expect(
      await db.query.supplierOrderIssueTable.findFirst({ where: eq(supplierOrderIssueTable.id, source.id) }),
    ).toMatchObject({ status: 'OPEN' });
  });

  it('permite compensación no prevista pero no asociarla a una línea pagada', async () => {
    const source = await issue();
    await expect(review([{ ...expected(2, 0), sourceIssueId: source.id }])).rejects.toMatchObject({ statusCode: 400 });
    const result = await review([{ productVariantId: variantId, availableQuantity: 2, sourceIssueId: source.id }]);
    expect(result.items[0]).toMatchObject({
      supplierOrderProductId: null,
      sourceIssueId: source.id,
      unplannedUnitCostPen: null,
    });
  });

  it('rechaza compensaciones de otra variante y cantidades superiores a la incidencia', async () => {
    const source = await issue();
    await expect(
      review([{ productVariantId: otherVariantId, availableQuantity: 1, sourceIssueId: source.id }]),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      review([{ productVariantId: variantId, availableQuantity: 3, sourceIssueId: source.id }]),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await items()).toEqual([]);
  });

  it('controla compensaciones acumuladas entre distintos paquetes', async () => {
    const source = await issue();
    await review([{ productVariantId: variantId, availableQuantity: 2, sourceIssueId: source.id }]);
    const next = await arrivals.create(orderId, {}, userId);
    await expect(
      service.review(
        orderId,
        next.id,
        reviewSupplierOrderReceiptSchema.parse({
          items: [{ productVariantId: variantId, availableQuantity: 1, sourceIssueId: source.id }],
        }),
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rechaza incidencias cerradas, ajenas y de la propia compra', async () => {
    const source = await issue();
    const data = [{ productVariantId: variantId, availableQuantity: 1, sourceIssueId: source.id }];
    await db
      .update(supplierOrderIssueTable)
      .set({ status: 'CLOSED', closedAt: new Date(), closedBy: userId, resolutionNote: 'Crédito' })
      .where(eq(supplierOrderIssueTable.id, source.id));
    await expect(review(data)).rejects.toMatchObject({ statusCode: 409 });
    await db
      .update(supplierOrderIssueTable)
      .set({ status: 'OPEN', closedAt: null, closedBy: null, resolutionNote: null })
      .where(eq(supplierOrderIssueTable.id, source.id));
    const [other] = await db.insert(supplierTable).values({ name: randomUUID(), createdBy: userId }).returning();
    await db
      .update(supplierOrderTable)
      .set({ supplierId: other.id })
      .where(eq(supplierOrderTable.id, source.supplierOrderId));
    await expect(review(data)).rejects.toMatchObject({ statusCode: 409 });
    await db
      .update(supplierOrderIssueTable)
      .set({ supplierOrderId: orderId, supplierOrderProductId: lineId })
      .where(eq(supplierOrderIssueTable.id, source.id));
    await expect(review(data)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('revierte los detalles insertados si falla la auditoría de revisión', async () => {
    await expect(
      service.review(orderId, receiptId, reviewSupplierOrderReceiptSchema.parse({ items: [expected()] }), randomUUID()),
    ).rejects.toThrow();
    expect(await items()).toEqual([]);
    expect(await receipt()).toMatchObject({ reviewStatus: 'PENDING', reviewedAt: null });
    expect(await order()).toMatchObject({ reviewStatus: 'PENDING' });
  });

  it('rechaza compras históricas, canceladas y recepciones ajenas', async () => {
    await expect(
      service.review(orderId, randomUUID(), reviewSupplierOrderReceiptSchema.parse({ items: [expected()] }), userId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await db
      .update(supplierOrderTable)
      .set({ recordOrigin: 'LEGACY_IMPORT' })
      .where(eq(supplierOrderTable.id, orderId));
    await expect(review([expected()])).rejects.toMatchObject({ statusCode: 409 });
    await db
      .update(supplierOrderTable)
      .set({ recordOrigin: 'SYSTEM', status: 'CANCELLED' })
      .where(eq(supplierOrderTable.id, orderId));
    await expect(review([expected()])).rejects.toMatchObject({ statusCode: 409 });
  });
});
