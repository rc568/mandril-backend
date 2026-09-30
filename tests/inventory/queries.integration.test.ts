import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { routerApp } from '@/app/router';
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
let cookie: string;
let variantId: number;
let emptyVariantId: number;
beforeEach(async () => {
  await resetTestSchema();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Queries', lastName: 'Test', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  cookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'employee' })}`;
  const [product] = await db.insert(productTable).values({ name: 'Camera', slug: tag, createdBy: userId }).returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      ['IQ001', 'IQ002'].map((code) => ({
        productId: product.id,
        code,
        price: '100',
        purchasePrice: '60.123456',
        quantityInStock: 999,
        createdBy: userId,
      })),
    )
    .returning();
  variantId = variants[0].id;
  emptyVariantId = variants[1].id;
  await db.insert(inventoryBalanceTable).values([
    { productVariantId: variantId, bucket: 'AVAILABLE', quantity: 7, updatedBy: userId },
    { productVariantId: variantId, bucket: 'RESERVED', quantity: 3, updatedBy: userId },
  ]);
  await db.insert(stockMovementTable).values([
    {
      productVariantId: variantId,
      type: 'ADJUSTMENT',
      quantity: 10,
      toBucket: 'AVAILABLE',
      note: 'Initial count',
      unitCostPen: '60.123456',
      createdBy: userId,
      createdAt: new Date('2026-09-01T12:00:00Z'),
    },
    {
      productVariantId: variantId,
      type: 'ADJUSTMENT',
      quantity: 3,
      fromBucket: 'AVAILABLE',
      note: 'New count',
      unitCostPen: '60.123456',
      createdBy: userId,
      createdAt: new Date('2026-09-02T12:00:00Z'),
    },
  ]);
});
const get = (path: string, query: Record<string, string | number | undefined> = {}) =>
  request(app).get(`/api/inventory/${path}`).set('Cookie', cookie).query(query);

describe('consultas de inventario', () => {
  it('devuelve las cuatro condiciones sin mezclar reservas ni interpretar el stock antiguo', async () => {
    const result = await get('balances').expect(200);
    expect(result.body.pagination.totalItems).toBe(2);
    expect(result.body.variants[0].balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 7, updatedBy: userId }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 3 }),
        { bucket: 'QUARANTINE', quantity: 0, updatedAt: null, updatedBy: null, updatedByName: null },
      ]),
    );
    expect(result.body.variants[0].balances).toHaveLength(4);
    expect(result.body.variants[1].balances.every((balance: { quantity: number }) => balance.quantity === 0)).toBe(
      true,
    );
    const filtered = await get('balances', { productVariantId: variantId, bucket: 'RESERVED', search: 'IQ001' }).expect(
      200,
    );
    expect(filtered.body.variants).toHaveLength(1);
    expect(filtered.body.variants[0].balances).toEqual([expect.objectContaining({ bucket: 'RESERVED', quantity: 3 })]);
  });

  it('filtra entradas y salidas, devuelve costo exacto y auditoría, y ordena por fecha', async () => {
    const result = await get('movements', {
      productVariantId: variantId,
      bucket: 'AVAILABLE',
      type: 'ADJUSTMENT',
      createdBy: userId,
    }).expect(200);
    expect(result.body.pagination.totalItems).toBe(2);
    expect(result.body.movements[0]).toMatchObject({
      fromBucket: 'AVAILABLE',
      quantity: 3,
      unitCostPen: '60.123456',
      createdBy: userId,
      note: 'New count',
      code: 'IQ001',
    });
    expect(result.body.movements[0].createdByName).toBeTruthy();
    const dated = await get('movements', {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-01T23:59:59Z',
      search: 'Camera',
    }).expect(200);
    expect(dated.body.movements).toEqual([expect.objectContaining({ toBucket: 'AVAILABLE', quantity: 10 })]);
    for (const query of [
      { bucket: 'DEFECTIVE' },
      { productVariantId: emptyVariantId },
      { orderId: randomUUID() },
      { supplierOrderId: randomUUID() },
      { search: "' OR 1=1 --" },
    ]) {
      expect((await get('movements', query).expect(200)).body.movements).toEqual([]);
    }
  });

  it('conserva saldos e historial de variantes eliminadas', async () => {
    await db
      .update(productVariantTable)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(productVariantTable.id, variantId));
    const result = await get('balances', { productVariantId: variantId }).expect(200);
    expect(result.body.variants[0].deletedAt).toBeTruthy();
    expect(result.body.variants[0].balances[0].quantity).toBe(7);
    expect((await get('movements').expect(200)).body.movements).toHaveLength(2);
  });

  it('pagina movimientos sin duplicarlos aunque compartan fecha', async () => {
    await db.insert(stockMovementTable).values(
      Array.from({ length: 25 }, () => ({
        productVariantId: variantId,
        type: 'ADJUSTMENT' as const,
        quantity: 1,
        toBucket: 'AVAILABLE' as const,
        unitCostPen: '60.123456',
        note: 'Count',
        createdBy: userId,
        createdAt: new Date('2026-09-03T12:00:00Z'),
      })),
    );
    const first = await get('movements', { limit: 24, page: 1 }).expect(200);
    const second = await get('movements', { limit: 24, page: 2 }).expect(200);
    expect(first.body.pagination).toMatchObject({ totalItems: 27, nextPage: 2 });
    expect(first.body.movements).toHaveLength(24);
    expect(second.body.movements).toHaveLength(3);
    expect(new Set([...first.body.movements, ...second.body.movements].map((movement) => movement.id)).size).toBe(27);
    expect((await get('movements', { page: 3, limit: 24 }).expect(200)).body.movements).toEqual([]);
  });

  it('rechaza filtros inválidos y exige autenticación en ambos endpoints', async () => {
    for (const path of ['balances', 'movements']) {
      await request(app).get(`/api/inventory/${path}`).expect(401);
      for (const query of [
        { page: 0 },
        { page: '1.5' },
        { limit: 999 },
        { productVariantId: '-1' },
        { bucket: 'UNKNOWN' },
      ])
        await get(path, query).expect(400);
    }
    await get('movements', { type: 'UNKNOWN' }).expect(400);
    await get('movements', { start: '2026-09-03T00:00:00Z', end: '2026-09-01T00:00:00Z' }).expect(400);
  });
});
