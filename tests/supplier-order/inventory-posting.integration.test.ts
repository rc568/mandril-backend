import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InventoryService } from '@/modules/inventory';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new InventoryService();
let userId: string;
let orderId: string;
let receiptId: string;
let itemId: string;
let variantId: number;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Inventory',
      lastName: 'Service',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  const [order] = await db
    .insert(supplierOrderTable)
    .values({ supplierId: supplier.id, status: 'RECEIVED', createdBy: userId })
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
      quantityInStock: 8,
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;
  await db.insert(inventoryBalanceTable).values([
    { productVariantId: variantId, bucket: 'AVAILABLE', quantity: 8, updatedBy: userId },
    { productVariantId: variantId, bucket: 'RESERVED', quantity: 2, updatedBy: userId },
    { productVariantId: variantId, bucket: 'DEFECTIVE', quantity: 3, updatedBy: userId },
  ]);
  const receipt = await makeReceipt(1);
  receiptId = receipt.id;
  itemId = receipt.itemId;
});

async function makeReceipt(packageNumber: number) {
  const [receipt] = await db
    .insert(supplierOrderReceiptTable)
    .values({
      supplierOrderId: orderId,
      packageNumber,
      receivedAt: new Date(),
      receivedBy: userId,
      reviewStatus: 'COMPLETED',
      reviewedAt: new Date(),
      reviewedBy: userId,
      createdBy: userId,
    })
    .returning();
  const [item] = await db
    .insert(supplierOrderReceiptItemTable)
    .values({
      receiptId: receipt.id,
      productVariantId: variantId,
      availableQuantity: 5,
      defectiveQuantity: 1,
    })
    .returning();
  return { id: receipt.id, itemId: item.id };
}

const post = (unitCostPen: string | null = '90.000000') =>
  service.postPurchaseReceipt(orderId, receiptId, [{ receiptItemId: itemId, unitCostPen }], userId);
const balances = () =>
  db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId));
const variant = () => db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) });
const movements = () => db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, orderId));

describe('ingreso transaccional de paquetes al inventario', () => {
  it('actualiza saldos, promedio y movimientos del paquete revisado', async () => {
    expect(await post()).toEqual({ receiptId, inventoryPosted: true });
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 13, updatedBy: userId }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 2 }),
        expect.objectContaining({ bucket: 'DEFECTIVE', quantity: 4 }),
      ]),
    );
    expect(await variant()).toMatchObject({ purchasePrice: '70.000000', updatedBy: userId, quantityInStock: 8 });
    expect(await movements()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supplierOrderReceiptItemId: itemId,
          toBucket: 'AVAILABLE',
          quantity: 5,
          unitCostPen: '90.000000',
        }),
        expect.objectContaining({
          supplierOrderReceiptItemId: itemId,
          toBucket: 'DEFECTIVE',
          quantity: 1,
          unitCostPen: '90.000000',
        }),
      ]),
    );
  });

  it('rechaza un segundo ingreso sin duplicar saldos ni promedios', async () => {
    await post();
    await expect(post()).rejects.toMatchObject({
      statusCode: 409,
      message: errorMessages.inventory.receiptAlreadyPosted,
    });
    expect(await movements()).toHaveLength(2);
    expect((await variant())?.purchasePrice).toBe('70.000000');
  });

  it('serializa dos intentos simultáneos del mismo paquete', async () => {
    const results = await Promise.allSettled([post(), post()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    expect(await movements()).toHaveLength(2);
  });

  it('acumula dos paquetes concurrentes sin perder unidades', async () => {
    const other = await makeReceipt(2);
    await Promise.all([
      post(),
      service.postPurchaseReceipt(
        orderId,
        other.id,
        [{ receiptItemId: other.itemId, unitCostPen: '90.000000' }],
        userId,
      ),
    ]);
    expect((await variant())?.purchasePrice).toBe('75.000000');
    expect(await balances()).toEqual(
      expect.arrayContaining([expect.objectContaining({ bucket: 'AVAILABLE', quantity: 18 })]),
    );
    expect(await movements()).toHaveLength(4);
  });

  it('agrupa varias líneas de una variante antes de calcular el promedio', async () => {
    const [extra] = await db
      .insert(supplierOrderReceiptItemTable)
      .values({
        receiptId,
        productVariantId: variantId,
        availableQuantity: 5,
        defectiveQuantity: 0,
      })
      .returning();
    await service.postPurchaseReceipt(
      orderId,
      receiptId,
      [
        { receiptItemId: itemId, unitCostPen: '90.000000' },
        { receiptItemId: extra.id, unitCostPen: '0.000000' },
      ],
      userId,
    );
    expect((await variant())?.purchasePrice).toBe('52.500000');
    expect(await movements()).toHaveLength(3);
  });

  it('solo defectuosas conservan el precio anterior', async () => {
    await db
      .update(supplierOrderReceiptItemTable)
      .set({ availableQuantity: 0 })
      .where(eq(supplierOrderReceiptItemTable.id, itemId));
    await post();
    expect((await variant())?.purchasePrice).toBe('60.000000');
    expect(await movements()).toHaveLength(1);
  });

  it('admite costo cero pero rechaza costos pendientes sin cambios', async () => {
    const before = await balances();
    await expect(post(null)).rejects.toMatchObject({
      statusCode: 400,
      message: errorMessages.inventory.finalCostRequired,
    });
    expect(await balances()).toEqual(before);
    expect(await movements()).toEqual([]);
    await post('0.000000');
    expect((await variant())?.purchasePrice).toBe('40.000000');
  });

  it('exige todos los costos sin IDs ajenos ni duplicados', async () => {
    for (const costs of [
      [],
      [{ receiptItemId: randomUUID(), unitCostPen: '90.000000' }],
      [
        { receiptItemId: itemId, unitCostPen: '90.000000' },
        { receiptItemId: itemId, unitCostPen: '90.000000' },
      ],
    ]) {
      await expect(service.postPurchaseReceipt(orderId, receiptId, costs, userId)).rejects.toMatchObject({
        statusCode: 400,
      });
    }
    expect(await movements()).toEqual([]);
  });

  it('bloquea paquetes sin revisión y compras históricas o canceladas', async () => {
    await db
      .update(supplierOrderReceiptTable)
      .set({ reviewStatus: 'PENDING', reviewedAt: null, reviewedBy: null })
      .where(eq(supplierOrderReceiptTable.id, receiptId));
    await expect(post()).rejects.toMatchObject({ statusCode: 409 });
    await db
      .update(supplierOrderReceiptTable)
      .set({ reviewStatus: 'COMPLETED', reviewedAt: new Date(), reviewedBy: userId })
      .where(eq(supplierOrderReceiptTable.id, receiptId));
    await db
      .update(supplierOrderTable)
      .set({ recordOrigin: 'LEGACY_IMPORT' })
      .where(eq(supplierOrderTable.id, orderId));
    await expect(post()).rejects.toMatchObject({ statusCode: 409 });
    await db
      .update(supplierOrderTable)
      .set({ recordOrigin: 'SYSTEM', status: 'CANCELLED' })
      .where(eq(supplierOrderTable.id, orderId));
    await expect(post()).rejects.toMatchObject({ statusCode: 409 });
  });

  it('no supone que el stock anterior es cero ni lo migra automáticamente', async () => {
    await db.delete(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId));
    await expect(post()).rejects.toMatchObject({ message: errorMessages.inventory.balanceNotInitialized });
    expect(await balances()).toEqual([]);
    await db.update(productVariantTable).set({ quantityInStock: 0 }).where(eq(productVariantTable.id, variantId));
    await post();
    expect((await variant())?.purchasePrice).toBe('90.000000');
  });

  it('revierte todo si falla una operación posterior en la transacción del caller', async () => {
    const before = await balances();
    await expect(
      db.transaction(async (tx) => {
        await service.postPurchaseReceipt(
          orderId,
          receiptId,
          [{ receiptItemId: itemId, unitCostPen: '90.000000' }],
          userId,
          tx,
        );
        throw new Error('Failure after posting');
      }),
    ).rejects.toThrow('Failure after posting');
    expect(await balances()).toEqual(before);
    expect(await movements()).toEqual([]);
    expect((await variant())?.purchasePrice).toBe('60.000000');
  });

  it('rechaza saldos que exceden la capacidad sin guardar movimientos', async () => {
    await db
      .update(inventoryBalanceTable)
      .set({ quantity: 2147483647 })
      .where(and(eq(inventoryBalanceTable.productVariantId, variantId), eq(inventoryBalanceTable.bucket, 'AVAILABLE')));
    await expect(post()).rejects.toMatchObject({ message: errorMessages.inventory.balanceOverflow });
    expect(await movements()).toEqual([]);
  });

  it('rechaza paquetes y compras inexistentes', async () => {
    await expect(service.postPurchaseReceipt(orderId, randomUUID(), [], userId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.postPurchaseReceipt(randomUUID(), receiptId, [], userId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
