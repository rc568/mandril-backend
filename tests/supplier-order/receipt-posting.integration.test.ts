import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupplierOrderSchema } from '@/modules/supplier-order/schemas/supplier-order.schema';
import { reviewSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';
import { SupplierOrderService } from '@/modules/supplier-order/supplier-order.service';
import { SupplierOrderCostService } from '@/modules/supplier-order/supplier-order-cost.service';
import { SupplierOrderExpenseService } from '@/modules/supplier-order/supplier-order-expense.service';
import { SupplierOrderReceiptService } from '@/modules/supplier-order/supplier-order-receipt.service';
import { SupplierOrderReceiptReviewService } from '@/modules/supplier-order/supplier-order-receipt-review.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const purchases = new SupplierOrderService();
const receipts = new SupplierOrderReceiptService();
const reviews = new SupplierOrderReceiptReviewService();
const costs = new SupplierOrderCostService();
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
    .values({ name: 'Posting', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
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
  await db.insert(inventoryBalanceTable).values([
    { productVariantId: variantId, bucket: 'AVAILABLE', quantity: 8, updatedBy: userId },
    { productVariantId: variantId, bucket: 'RESERVED', quantity: 2, updatedBy: userId },
  ]);
  const purchase = await purchases.create(
    createSupplierOrderSchema.parse({
      supplierId: supplier.id,
      currency: 'USD',
      supplierPaymentAmount: 180,
      projectedExchangeRate: 3.4,
      products: [{ productVariantId: variantId, type: 'PURCHASE', quantityOrdered: 15, unitPrice: 10 }],
    }),
    userId,
  );
  orderId = purchase.id;
  lineId = purchase.products[0].id;
  await new SupplierOrderExpenseService().create(
    orderId,
    {
      type: 'INTERNATIONAL_SHIPPING',
      amountUsd: '30.000000',
      amountPen: '105.000000',
      includedInSupplierPayment: true,
    },
    userId,
  );
});
async function receive(availableQuantity: number, defectiveQuantity = 0) {
  const receipt = await receipts.create(orderId, {}, userId);
  await reviews.review(
    orderId,
    receipt.id,
    reviewSupplierOrderReceiptSchema.parse({
      items: [{ supplierOrderProductId: lineId, availableQuantity, defectiveQuantity }],
    }),
    userId,
  );
  return receipt;
}
const post = (receiptId: string) => receipts.postToInventory(orderId, receiptId, userId);
const movements = () => db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, orderId));
const variant = () => db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) });
const balances = () =>
  db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId));

describe('confirmación de ingreso por paquete con costos guardados', () => {
  it('ingresa 10 unidades y luego 5 de la misma línea, con el mismo costo y sin duplicar gastos', async () => {
    const first = await receive(10);
    expect((await receipts.getAll(orderId))[0].inventoryPosted).toBe(false);
    await costs.calculateAndSave(orderId, userId);
    expect((await purchases.getById(orderId)).products[0]).toMatchObject({
      calculatedUnitCost: '12.000000',
      calculatedUnitCostPen: '48.144000',
    });
    expect(await post(first.id)).toEqual({ receiptId: first.id, inventoryPosted: true });
    expect(await variant()).toMatchObject({ purchasePrice: '54.072000' });
    expect((await receipts.getAll(orderId))[0].inventoryPosted).toBe(true);

    const second = await receive(5);
    await receipts.closeReceiving(orderId, userId);
    expect((await receipts.getAll(orderId)).map((receipt) => receipt.inventoryPosted)).toEqual([true, false]);
    await expect(costs.calculateAndSave(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      purchases.updateProjectedExchangeRate(orderId, { projectedExchangeRate: '4.000000' }, userId),
    ).rejects.toMatchObject({ statusCode: 409 });
    await post(second.id);
    expect((await receipts.getAll(orderId)).map((receipt) => receipt.inventoryPosted)).toEqual([true, true]);
    const entries = await movements();
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.quantity).sort((a, b) => a - b)).toEqual([5, 10]);
    expect(entries.every((entry) => entry.unitCostPen === '48.144000')).toBe(true);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 23 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 2 }),
      ]),
    );
    // (10 existing good units * 60 + 15 purchased good units * 48.144) / 25.
    expect(await variant()).toMatchObject({ purchasePrice: '52.886400' });
    await expect(post(first.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(post(second.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await movements()).toHaveLength(2);
    expect(await variant()).toMatchObject({ purchasePrice: '52.886400' });
  });

  it.each(['reverse', 'concurrent'])(
    'conserva cantidades y costos al confirmar los paquetes en orden %s',
    async (mode) => {
      const first = await receive(10);
      const second = await receive(5);
      await costs.calculateAndSave(orderId, userId);
      if (mode === 'reverse') {
        await post(second.id);
        await post(first.id);
      } else {
        await Promise.all([post(first.id), post(second.id)]);
      }
      expect(await movements()).toHaveLength(2);
      expect((await movements()).every((entry) => entry.unitCostPen === '48.144000')).toBe(true);
      expect(await variant()).toMatchObject({ purchasePrice: '52.886400' });
      expect(await balances()).toEqual(
        expect.arrayContaining([expect.objectContaining({ bucket: 'AVAILABLE', quantity: 23 })]),
      );
    },
  );

  it('usa el mismo costo para buenas y defectuosas, pero solo las buenas entran al promedio', async () => {
    const first = await receive(10);
    const second = await receive(4, 1);
    await costs.calculateAndSave(orderId, userId);
    await post(first.id);
    await post(second.id);
    expect(await movements()).toHaveLength(3);
    expect((await movements()).every((entry) => entry.unitCostPen === '48.144000')).toBe(true);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 22 }),
        expect.objectContaining({ bucket: 'DEFECTIVE', quantity: 1 }),
      ]),
    );
    expect(await variant()).toMatchObject({ purchasePrice: '53.084000' });
  });

  it('mantiene inventoryPosted en false al fallar por revisión o costo pendiente', async () => {
    const pending = await receipts.create(orderId, {}, userId);
    await expect(post(pending.id)).rejects.toMatchObject({ statusCode: 409 });
    const reviewed = await receive(10);
    await expect(post(reviewed.id)).rejects.toMatchObject({ statusCode: 409 });
    expect((await receipts.getAll(orderId)).map((receipt) => receipt.inventoryPosted)).toEqual([false, false]);
    expect(await movements()).toHaveLength(0);
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
  });

  it('revierte el paquete entero y su indicador si un saldo excede el límite', async () => {
    const received = await receive(9, 1);
    await costs.calculateAndSave(orderId, userId);
    await db
      .insert(inventoryBalanceTable)
      .values({ productVariantId: variantId, bucket: 'DEFECTIVE', quantity: 2147483647, updatedBy: userId });
    await expect(post(received.id)).rejects.toMatchObject({ statusCode: 409 });
    expect((await receipts.getAll(orderId))[0].inventoryPosted).toBe(false);
    expect(await movements()).toHaveLength(0);
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
    expect(await balances()).toEqual(
      expect.arrayContaining([expect.objectContaining({ bucket: 'AVAILABLE', quantity: 8 })]),
    );
  });
});
