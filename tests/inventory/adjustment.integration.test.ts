import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { and, eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routerApp } from '@/app/router';
import { InventoryAdjustmentService } from '@/modules/inventory/inventory-adjustment.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
  userTable,
} from '@/shared/db';
import { Jwt } from '@/shared/libs/jwt';
import { errorHandler } from '@/shared/middlewares';
import { sendError, sendSuccess } from '@/shared/utils/api-response';
import { resetTestSchema } from '../support/schema';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.response.sendSuccess = sendSuccess;
app.response.sendError = sendError;
app.use('/api', routerApp());
app.use(errorHandler);
let userId: string;
let variantId: number;
let admin: string;
let employee: string;
let code = 0;
beforeAll(resetTestSchema);
beforeEach(async () => {
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Inventory', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  admin = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'admin' })}`;
  employee = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'employee' })}`;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const [variant] = await db
    .insert(productVariantTable)
    .values({
      productId: product.id,
      code: String(++code).padStart(5, '0'),
      price: '100.000000',
      purchasePrice: '60.123456',
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;
});
const body = (countedQuantity: number, bucket = 'AVAILABLE') => ({
  productVariantId: variantId,
  bucket,
  countedQuantity,
  reason: 'Conteo físico',
});
const adjust = (payload: object, cookie = admin) =>
  request(app).post('/api/inventory/adjustments').set('Cookie', cookie).send(payload);
const movements = () => db.select().from(stockMovementTable).where(eq(stockMovementTable.productVariantId, variantId));
const balances = () =>
  db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId));

describe('ajustes administrativos de inventario', () => {
  it('crea existencias y después registra solo la diferencia, sin cambiar costo ni stock anterior', async () => {
    const initial = await adjust(body(10)).expect(200);
    expect(initial.body).toMatchObject({
      previousQuantity: 0,
      quantity: 10,
      movement: {
        type: 'ADJUSTMENT',
        quantity: 10,
        fromBucket: null,
        toBucket: 'AVAILABLE',
        unitCostPen: '60.123456',
        createdBy: userId,
        note: 'Conteo físico',
      },
    });
    const reduced = await adjust(body(4)).expect(200);
    expect(reduced.body).toMatchObject({
      previousQuantity: 10,
      quantity: 4,
      movement: { quantity: 6, fromBucket: 'AVAILABLE', toBucket: null },
    });
    const increased = await adjust(body(7)).expect(200);
    expect(increased.body.movement).toMatchObject({ quantity: 3, fromBucket: null, toBucket: 'AVAILABLE' });
    expect(await balances()).toEqual([expect.objectContaining({ quantity: 7, updatedBy: userId })]);
    const [variant] = await db.select().from(productVariantTable).where(eq(productVariantTable.id, variantId));
    expect(variant).toMatchObject({ quantityInStock: 0, purchasePrice: '60.123456' });
  });

  it('permite cero y no crea movimientos si el saldo ya coincide', async () => {
    await adjust(body(5)).expect(200);
    await adjust(body(0)).expect(200);
    const unchanged = await adjust(body(0)).expect(200);
    expect(unchanged.body).toMatchObject({ previousQuantity: 0, quantity: 0, movement: null });
    expect(await movements()).toHaveLength(2);
    expect(await balances()).toEqual([expect.objectContaining({ quantity: 0 })]);
  });

  it.each(['QUARANTINE', 'DEFECTIVE'])('ajusta %s sin modificar AVAILABLE ni RESERVED', async (bucket) => {
    await db.insert(inventoryBalanceTable).values([
      { productVariantId: variantId, bucket: 'AVAILABLE', quantity: 4, updatedBy: userId },
      { productVariantId: variantId, bucket: 'RESERVED', quantity: 3, updatedBy: userId },
    ]);
    await adjust(body(5, bucket)).expect(200);
    await adjust(body(2, bucket)).expect(200);
    expect(await balances()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 4 }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 3 }),
        expect.objectContaining({ bucket, quantity: 2 }),
      ]),
    );
  });

  it('rechaza cantidades inválidas, motivo vacío, RESERVED y campos de auditoría enviados', async () => {
    for (const changes of [
      { countedQuantity: -1 },
      { countedQuantity: 1.5 },
      { countedQuantity: 2147483648 },
      { bucket: 'RESERVED' },
      { reason: '   ' },
      { reason: undefined },
      { createdBy: userId },
      { unitCostPen: '1' },
      { productVariantId: -1 },
    ])
      await adjust({ ...body(2), ...changes }).expect(400);
    expect(await movements()).toHaveLength(0);
    expect(await balances()).toHaveLength(0);
  });

  it('exige administrador y sesión válida', async () => {
    await adjust(body(2), employee).expect(403);
    await request(app).post('/api/inventory/adjustments').send(body(2)).expect(401);
    expect(await movements()).toHaveLength(0);
  });

  it('rechaza variantes inexistentes, eliminadas o con stock antiguo no migrado', async () => {
    await adjust({ ...body(2), productVariantId: 32767 }).expect(404);
    await db.update(productVariantTable).set({ quantityInStock: 8 }).where(eq(productVariantTable.id, variantId));
    await adjust(body(2)).expect(409);
    await db
      .update(productVariantTable)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(productVariantTable.id, variantId));
    await adjust(body(2)).expect(404);
    expect(await balances()).toHaveLength(0);
  });

  it('serializa ajustes concurrentes y conserva la diferencia real de cada operación', async () => {
    const results = await Promise.all([adjust(body(5)), adjust(body(8))]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const [balance] = await balances();
    const entries = await movements();
    expect(entries).toHaveLength(2);
    expect([5, 8]).toContain(balance.quantity);
    expect(entries.reduce((total, entry) => total + (entry.toBucket ? entry.quantity : -entry.quantity), 0)).toBe(
      balance.quantity,
    );
    const duplicates = await Promise.all([adjust(body(balance.quantity)), adjust(body(balance.quantity))]);
    expect(duplicates.every((result) => result.body.movement === null)).toBe(true);
    expect(await movements()).toHaveLength(2);
  });

  it('revierte el saldo si falla la inserción del movimiento', async () => {
    await adjust(body(5)).expect(200);
    // A database constraint fails after the balance update, exercising transaction rollback.
    await expect(
      new InventoryAdjustmentService().adjust({ ...body(3), bucket: 'AVAILABLE', reason: ' ' }, userId),
    ).rejects.toThrow();
    expect(await balances()).toEqual([expect.objectContaining({ quantity: 5 })]);
    expect(await movements()).toHaveLength(1);
  });

  it('conserva un costo actual de cero y la base rechaza ajustar RESERVED', async () => {
    await db
      .update(productVariantTable)
      .set({ purchasePrice: '0.000000' })
      .where(eq(productVariantTable.id, variantId));
    expect((await adjust(body(2)).expect(200)).body.movement.unitCostPen).toBe('0.000000');
    await expect(
      db.insert(stockMovementTable).values({
        productVariantId: variantId,
        type: 'ADJUSTMENT',
        quantity: 1,
        toBucket: 'RESERVED',
        unitCostPen: '0',
        note: 'Invalid',
        createdBy: userId,
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(inventoryBalanceTable)
        .where(
          and(eq(inventoryBalanceTable.productVariantId, variantId), eq(inventoryBalanceTable.bucket, 'RESERVED')),
        ),
    ).toHaveLength(0);
  });
});
