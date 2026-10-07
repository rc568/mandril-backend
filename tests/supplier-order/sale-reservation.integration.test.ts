import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InventorySaleService } from '@/modules/inventory/inventory-sale.service';
import {
  clientTable,
  db,
  inventoryBalanceTable,
  orderProductTable,
  orderTable,
  productTable,
  productVariantTable,
  salesChannelTable,
  stockMovementTable,
  userTable,
} from '@/shared/db';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new InventorySaleService();
let userId: string;
let clientId: string;
let channelId: number;
let variantId: number;
let orderId: string;
let code = 0;
beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Reservation', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [client] = await db.insert(clientTable).values({ contactName: tag, createdBy: userId }).returning();
  clientId = client.id;
  const [channel] = await db
    .insert(salesChannelTable)
    .values({ channel: tag.slice(0, 25), createdBy: userId })
    .returning();
  channelId = channel.id;
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
  await db
    .insert(inventoryBalanceTable)
    .values({ productVariantId: variantId, bucket: 'AVAILABLE', quantity: 10, updatedBy: userId });
  orderId = await sale();
});
async function sale(quantity = 3) {
  const [order] = await db
    .insert(orderTable)
    .values({
      clientId,
      salesChannelId: channelId,
      type: 'SALE',
      status: 'PENDING',
      totalSale: '300.000000',
      totalCost: '180.000000',
      numProducts: quantity,
      createdBy: userId,
    })
    .returning();
  await db.insert(orderProductTable).values({
    orderId: order.id,
    productVariantId: variantId,
    type: 'SALE',
    price: '100.000000',
    purchasePrice: '60.000000',
    quantity,
  });
  return order.id;
}
const reserve = (quantity: number, id = orderId) =>
  service.setReservation(id, [{ productVariantId: variantId, quantity }], userId);
const balances = () =>
  db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId));
const movements = () => db.select().from(stockMovementTable).where(eq(stockMovementTable.orderId, orderId));
const variant = () => db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) });

describe('reservas de inventario por venta', () => {
  it('reserva unidades libres sin cambiar su existencia física ni el precio de compra', async () => {
    await reserve(3);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 7 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 3 }),
      ]),
    );
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
    expect(await movements()).toEqual([
      expect.objectContaining({
        type: 'RESERVATION',
        fromBucket: 'AVAILABLE',
        toBucket: 'RESERVED',
        quantity: 3,
        createdBy: userId,
      }),
    ]);
    await reserve(3);
    expect(await movements()).toHaveLength(1);
  });
  it('edita la reserva mediante diferencias y conserva todos los movimientos anteriores', async () => {
    await reserve(3);
    const [original] = await movements();
    await reserve(5);
    await reserve(2);
    const entries = await movements();
    expect(entries).toHaveLength(3);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: original.id, quantity: 3 }),
        expect.objectContaining({ type: 'RESERVATION', quantity: 2 }),
        expect.objectContaining({ type: 'RESERVATION_RELEASE', quantity: 3 }),
      ]),
    );
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 8 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 2 }),
      ]),
    );
  });
  it('libera solo las unidades reservadas por esta venta y conserva las de otro cliente', async () => {
    const other = await sale(4);
    await reserve(3);
    await reserve(4, other);
    await service.releaseReservation(orderId, userId);
    await service.releaseReservation(orderId, userId);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 6 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 4 }),
      ]),
    );
    expect(await movements()).toHaveLength(2);
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
  });
  it('entrega desde RESERVED sin descontar nuevamente AVAILABLE', async () => {
    await reserve(3);
    await service.deliverSale(orderId, userId);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 7 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 0 }),
      ]),
    );
    expect(await movements()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'SALE',
          fromBucket: 'RESERVED',
          toBucket: null,
          quantity: 3,
          unitCostPen: '60.000000',
        }),
      ]),
    );
    await expect(service.deliverSale(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await movements()).toHaveLength(2);
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
  });
  it('no usa la reserva de otra venta para entregar una venta sin reserva propia', async () => {
    const other = await sale(3);
    await reserve(3, other);
    await expect(service.deliverSale(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await movements()).toHaveLength(0);
  });
  it('rechaza reservas insuficientes o diferentes de las líneas de la venta', async () => {
    await reserve(2);
    await expect(service.deliverSale(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(reserve(11)).rejects.toMatchObject({ statusCode: 409 });
    expect(await balances()).toEqual(
      expect.arrayContaining([expect.objectContaining({ bucket: 'AVAILABLE', quantity: 8 })]),
    );
    expect(await movements()).toHaveLength(1);
  });
  it('serializa ventas concurrentes para impedir reservar más unidades de las disponibles', async () => {
    const other = await sale(8);
    const results = await Promise.allSettled([reserve(8), reserve(8, other)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 2 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 8 }),
      ]),
    );
  });
  it('permite que una transacción externa revierta reserva y movimientos juntos', async () => {
    await expect(
      db.transaction(async (tx) => {
        await service.setReservation(orderId, [{ productVariantId: variantId, quantity: 3 }], userId, tx);
        throw new Error('Rollback from Order Service');
      }),
    ).rejects.toThrow('Rollback from Order Service');
    expect(await movements()).toHaveLength(0);
    expect(await balances()).toEqual([expect.objectContaining({ bucket: 'AVAILABLE', quantity: 10 })]);
  });
  it.each(['CANCELLED', 'COMPLETED'] as const)('rechaza reservas para una venta %s', async (status) => {
    await db.update(orderTable).set({ status }).where(eq(orderTable.id, orderId));
    await expect(reserve(1)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('rechaza cantidades inválidas y variantes duplicadas sin movimientos parciales', async () => {
    for (const quantity of [0, -1, 1.5, 2147483648])
      await expect(reserve(quantity)).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.setReservation(
        orderId,
        [
          { productVariantId: variantId, quantity: 1 },
          { productVariantId: variantId, quantity: 1 },
        ],
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await movements()).toHaveLength(0);
  });
  it('rechaza reservar sin saldos y no interpreta movimientos históricos como reservas', async () => {
    await db.delete(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId));
    await expect(reserve(1)).rejects.toMatchObject({ statusCode: 409 });
    await db
      .insert(stockMovementTable)
      .values({ productVariantId: variantId, orderId, type: 'SALE', quantity: 3, createdBy: userId });
    await expect(service.releaseReservation(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await movements()).toHaveLength(1);
  });
  it('la base de datos rechaza una reserva con dirección incorrecta', async () => {
    await expect(
      db.insert(stockMovementTable).values({
        productVariantId: variantId,
        orderId,
        type: 'RESERVATION',
        fromBucket: 'RESERVED',
        toBucket: 'AVAILABLE',
        quantity: 1,
        createdBy: userId,
      }),
    ).rejects.toThrow();
    expect(await movements()).toHaveLength(0);
  });
});
