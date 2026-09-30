import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { migrateLegacyInventory } from '@/shared/db/migrations/legacy-inventory';
import { resetTestSchema } from '../support/schema';

let userId: string;
let variantId: number;
let channelId: number;
let clientId: string;
beforeEach(async () => {
  await resetTestSchema();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Migration', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const [variant] = await db
    .insert(productVariantTable)
    .values({
      productId: product.id,
      code: 'MG001',
      price: '100',
      purchasePrice: '60.123456',
      quantityInStock: 7,
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;
  const [channel] = await db.insert(salesChannelTable).values({ channel: 'Migration', createdBy: userId }).returning();
  channelId = channel.id;
  const [client] = await db.insert(clientTable).values({ contactName: 'Migration' }).returning();
  clientId = client.id;
});

async function legacySale(
  quantity: number,
  status: 'PENDING' | 'PAID' | 'COMPLETED' | 'CANCELLED' = 'PENDING',
  withMovement = true,
) {
  const [order] = await db
    .insert(orderTable)
    .values({
      type: 'SALE',
      status,
      salesChannelId: channelId,
      clientId,
      totalSale: '100',
      totalCost: '60',
      numProducts: quantity,
      createdBy: userId,
    })
    .returning();
  await db
    .insert(orderProductTable)
    .values({
      orderId: order.id,
      productVariantId: variantId,
      type: 'SALE',
      price: '100',
      purchasePrice: '50.000000',
      quantity,
    });
  if (withMovement)
    await db
      .insert(stockMovementTable)
      .values({
        orderId: order.id,
        productVariantId: variantId,
        type: 'SALE',
        quantity,
        createdBy: userId,
        createdAt: new Date('2021-01-01T12:00:00Z'),
      });
  return order.id;
}
const balances = () => db.select().from(inventoryBalanceTable);
const movements = () => db.select().from(stockMovementTable);

describe('migración del stock anterior', () => {
  it('previsualiza sin escribir y aplica saldos libres y reservas sin descontar dos veces', async () => {
    const pending = await legacySale(3);
    const paid = await legacySale(2, 'PAID');
    await legacySale(4, 'COMPLETED');
    await legacySale(1, 'CANCELLED');
    const before = await movements();
    const preview = await migrateLegacyInventory(userId);
    expect(preview).toMatchObject({
      applied: false,
      variants: 1,
      pendingSales: 2,
      reservations: 2,
      balances: [{ productVariantId: variantId, available: 7, reserved: 5, unitCostPen: '60.123456' }],
    });
    expect(await balances()).toHaveLength(0);
    expect(await movements()).toEqual(before);
    await migrateLegacyInventory(userId, true);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 7, updatedBy: userId }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 5 }),
      ]),
    );
    const after = await movements();
    for (const original of before) expect(after.find((row) => row.id === original.id)).toEqual(original);
    expect(after.filter((row) => row.type === 'ADJUSTMENT')).toEqual([
      expect.objectContaining({ quantity: 12, toBucket: 'AVAILABLE', unitCostPen: '60.123456' }),
    ]);
    expect(after.filter((row) => row.type === 'RESERVATION')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: pending,
          quantity: 3,
          legacyMovementId: before.find((row) => row.orderId === pending)?.id,
        }),
        expect.objectContaining({
          orderId: paid,
          quantity: 2,
          legacyMovementId: before.find((row) => row.orderId === paid)?.id,
        }),
      ]),
    );
    const inventory = new InventorySaleService();
    await inventory.releaseReservation(pending, userId);
    await inventory.deliverSale(paid, userId);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 10 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 0 }),
      ]),
    );
    const [variant] = await db.select().from(productVariantTable).where(eq(productVariantTable.id, variantId));
    expect(variant).toMatchObject({ quantityInStock: 7, purchasePrice: '60.123456' });
  });

  it('admite ventas cargadas sin movimientos y puede modificar su reserva después', async () => {
    const orderId = await legacySale(3, 'PAID', false);
    await migrateLegacyInventory(userId, true);
    await new InventorySaleService().setReservation(orderId, [{ productVariantId: variantId, quantity: 5 }], userId);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 5 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 5 }),
      ]),
    );
  });

  it('no vuelve a ejecutar la carga ni sobrescribe saldos existentes', async () => {
    await migrateLegacyInventory(userId, true);
    const before = await balances();
    const beforeMovements = await movements();
    await expect(migrateLegacyInventory(userId, true)).rejects.toThrow('Ya existen saldos');
    expect(await balances()).toEqual(before);
    expect(await movements()).toEqual(beforeMovements);
  });

  it('rechaza discrepancias entre líneas y movimientos sin escrituras parciales', async () => {
    const orderId = await legacySale(3);
    await db.update(stockMovementTable).set({ quantity: 2 }).where(eq(stockMovementTable.orderId, orderId));
    await expect(migrateLegacyInventory(userId, true)).rejects.toThrow('no coinciden');
    expect(await balances()).toHaveLength(0);
    expect(await movements()).toHaveLength(1);
  });

  it('rechaza ventas pendientes eliminadas y exige usuario de auditoría existente', async () => {
    const orderId = await legacySale(3);
    await expect(migrateLegacyInventory(randomUUID(), true)).rejects.toThrow('usuario');
    await db.update(orderTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(orderTable.id, orderId));
    await expect(migrateLegacyInventory(userId, true)).rejects.toThrow('pendientes eliminadas');
    expect(await balances()).toHaveLength(0);
  });

  it('migra cantidades cero y variantes eliminadas sin inventar movimientos vacíos', async () => {
    await db
      .update(productVariantTable)
      .set({ quantityInStock: 0, deletedAt: new Date(), deletedBy: userId })
      .where(eq(productVariantTable.id, variantId));
    await migrateLegacyInventory(userId, true);
    expect(await balances()).toHaveLength(2);
    expect((await balances()).every((row) => row.quantity === 0)).toBe(true);
    expect(await movements()).toHaveLength(0);
  });

  it('rechaza stock negativo o que desborde al incluir reservas', async () => {
    await db.update(productVariantTable).set({ quantityInStock: -1 }).where(eq(productVariantTable.id, variantId));
    await expect(migrateLegacyInventory(userId, true)).rejects.toThrow('fuera de rango');
    await db
      .update(productVariantTable)
      .set({ quantityInStock: 2147483647 })
      .where(eq(productVariantTable.id, variantId));
    await legacySale(1);
    await expect(migrateLegacyInventory(userId, true)).rejects.toThrow('fuera de rango');
    expect(await balances()).toHaveLength(0);
  });

  it('revierte también las filas insertadas si una reserva falla por costo inválido', async () => {
    const orderId = await legacySale(3);
    await db.update(orderProductTable).set({ purchasePrice: '-1' }).where(eq(orderProductTable.orderId, orderId));
    await expect(migrateLegacyInventory(userId, true)).rejects.toThrow();
    expect(await balances()).toHaveLength(0);
    expect(await movements()).toHaveLength(1);
  });
});
