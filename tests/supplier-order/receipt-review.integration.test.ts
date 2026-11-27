import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  completeSupplierOrderReceiptReviewSchema,
  createSupplierOrderReceiptSchema,
  updateSupplierOrderReceiptSchema,
} from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';
import { SupplierOrderReceiptService } from '@/modules/supplier-order/supplier-order-receipt.service';
import { SupplierOrderReceiptReviewService } from '@/modules/supplier-order/supplier-order-receipt-review.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const receipts = new SupplierOrderReceiptService();
const reviews = new SupplierOrderReceiptReviewService();
let userId: string;
let orderId: string;
let lineId: string;
let variantId: number;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Review', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  const [order] = await db
    .insert(supplierOrderTable)
    .values({ supplierId: supplier.id, currency: 'USD', supplierPaymentAmount: '100.000000', createdBy: userId })
    .returning();
  orderId = order.id;
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
});

const expected = (availableQuantity = 8, defectiveQuantity = 2) => ({
  supplierOrderProductId: lineId,
  availableQuantity,
  defectiveQuantity,
});
const create = (items: Record<string, unknown>[] = [expected()]) =>
  receipts.create(orderId, createSupplierOrderReceiptSchema.parse({ items }), userId);
const complete = (receiptId: string, reviewer = userId) =>
  reviews.completeReview(orderId, receiptId, completeSupplierOrderReceiptReviewSchema.parse(undefined), reviewer);
const itemsFor = (receiptId: string) =>
  db.select().from(supplierOrderReceiptItemTable).where(eq(supplierOrderReceiptItemTable.receiptId, receiptId));

describe('paquetes registrados, editados y completados', () => {
  it('registra productos con el paquete y permite completar la revisión sin body', async () => {
    const receipt = await create();
    expect(receipt).toMatchObject({ reviewStatus: 'PENDING', reviewedAt: null });
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      supplierOrderProductId: lineId,
      productVariantId: variantId,
      availableQuantity: 8,
      defectiveQuantity: 2,
    });
    expect(await db.select().from(inventoryBalanceTable)).toEqual([]);

    const completed = await complete(receipt.id);
    expect(completed).toMatchObject({ reviewStatus: 'COMPLETED', reviewedBy: userId });
    expect(completed.items).toHaveLength(1);
  });

  it('edita productos solo mientras el paquete está pendiente y revalida cantidades acumuladas', async () => {
    const receipt = await create();
    const updated = await receipts.update(
      orderId,
      receipt.id,
      updateSupplierOrderReceiptSchema.parse({
        observation: 'Unidades verificadas',
        items: [expected(6, 1)],
      }),
      userId,
    );
    expect(updated).toMatchObject({ observation: 'Unidades verificadas', reviewStatus: 'PENDING' });
    expect(updated.items[0]).toMatchObject({ availableQuantity: 6, defectiveQuantity: 1 });

    await expect(
      receipts.update(
        orderId,
        receipt.id,
        updateSupplierOrderReceiptSchema.parse({ items: [expected(11, 0)] }),
        userId,
      ),
    ).rejects.toMatchObject({ message: errorMessages.supplierOrder.receiptQuantityExceeded });
    expect(await itemsFor(receipt.id)).toHaveLength(1);
  });

  it('elimina físicamente un paquete pendiente y protege uno completado', async () => {
    const pending = await create();
    await receipts.delete(orderId, pending.id, userId);
    await expect(receipts.getById(orderId, pending.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await itemsFor(pending.id)).toEqual([]);

    const completed = await create();
    await complete(completed.id);
    await expect(receipts.delete(orderId, completed.id, userId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('impide cerrar si hay un paquete pendiente y cierra cuando todos están completados', async () => {
    const receipt = await create();
    await expect(receipts.closeReceiving(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.query.supplierOrderTable.findFirst({ where: eq(supplierOrderTable.id, orderId) }))?.status).toBe(
      'PARTIALLY_RECEIVED',
    );
    await complete(receipt.id);
    const closed = await receipts.closeReceiving(orderId, userId);
    expect(closed).toMatchObject({ status: 'RECEIVED', reviewStatus: 'COMPLETED', receivingClosedBy: userId });
  });

  it('no permite completar un paquete sin detalles ni con una segunda transición', async () => {
    const receipt = await create();
    await db.delete(supplierOrderReceiptItemTable).where(eq(supplierOrderReceiptItemTable.receiptId, receipt.id));
    await expect(complete(receipt.id)).rejects.toMatchObject({ statusCode: 409 });
    await db.insert(supplierOrderReceiptItemTable).values({
      receiptId: receipt.id,
      supplierOrderProductId: lineId,
      productVariantId: variantId,
      availableQuantity: 1,
    });
    await complete(receipt.id);
    await expect(complete(receipt.id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
