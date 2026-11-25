import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { and, eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routerApp } from '@/app/router';
import { StatsService } from '@/modules/stats/stats.service';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  salesChannelTable,
  stockMovementTable,
  userTable,
} from '@/shared/db';
import { Jwt } from '@/shared/libs/jwt';
import { errorHandler } from '@/shared/middlewares';
import { sendError, sendSuccess } from '@/shared/utils/api-response';
import { assertTestDatabase } from '../support/database';
import { resetTestSchema } from '../support/schema';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.response.sendSuccess = sendSuccess;
app.response.sendError = sendError;
app.use('/api', routerApp());
app.use(errorHandler);

let cookie: string;
let userId: string;
let salesChannelId: number;
let originalVariantId: number;
let exchangeVariantId: number;

beforeAll(resetTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Order', lastName: 'Lifecycle', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  cookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'employee' })}`;

  const [channel] = await db
    .insert(salesChannelTable)
    .values({ channel: tag.slice(0, 25), createdBy: userId })
    .returning();
  salesChannelId = channel.id;

  const products = await db
    .insert(productTable)
    .values([
      { name: `${tag} original`, slug: `${tag}-original`, createdBy: userId },
      { name: `${tag} exchange`, slug: `${tag}-exchange`, createdBy: userId },
    ])
    .returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      products.map((product, index) => ({
        productId: product.id,
        code: `${tag.slice(0, 4)}${index}`,
        price: '100.000000',
        purchasePrice: '60.000000',
        createdBy: userId,
      })),
    )
    .returning();
  [originalVariantId, exchangeVariantId] = variants.map((variant) => variant.id);

  await db.insert(inventoryBalanceTable).values(
    variants.map((variant) => ({
      productVariantId: variant.id,
      bucket: 'AVAILABLE' as const,
      quantity: 10,
      updatedBy: userId,
    })),
  );
});

const post = (path: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/orders${path}`).set('Cookie', cookie).send(body);
const patch = (path: string, body: Record<string, unknown> = {}) =>
  request(app).patch(`/api/orders${path}`).set('Cookie', cookie).send(body);
const getOrder = (id: string) => request(app).get(`/api/orders/${id}`).set('Cookie', cookie);
const getBalance = async (variantId: number, bucket: 'AVAILABLE' | 'RESERVED' = 'AVAILABLE') => {
  const [row] = await db
    .select()
    .from(inventoryBalanceTable)
    .where(and(eq(inventoryBalanceTable.productVariantId, variantId), eq(inventoryBalanceTable.bucket, bucket)));
  return row?.quantity ?? 0;
};
const getMovements = (orderId: string) =>
  db.select().from(stockMovementTable).where(eq(stockMovementTable.orderId, orderId));

describe('ciclo de venta, cambio y devolución', () => {
  it('borra el documento previo del cliente al actualizarlo a SIN DOCUMENTO', async () => {
    const saleResponse = await post('', {
      type: 'SALE',
      salesChannelId,
      client: {
        contactName: 'Cliente sin documento',
        documentNumberType: 'DNI',
        documentNumber: '12345678',
      },
      products: [{ variantId: originalVariantId, type: 'SALE', quantity: 1, price: 100 }],
    }).expect(201);

    const updatedOrder = await patch(`/${saleResponse.body.id as string}`, {
      client: { documentNumberType: 'SIN DOCUMENTO' },
    }).expect(200);

    expect(updatedOrder.body.client).toMatchObject({
      documentNumberType: null,
      documentNumber: null,
    });
  });

  it('completa las órdenes en secuencia, actualiza saldos y conserva referencias y resumen neto', async () => {
    const saleResponse = await post('', {
      type: 'SALE',
      salesChannelId,
      client: { contactName: 'Cliente ciclo de vida' },
      products: [{ variantId: originalVariantId, type: 'SALE', quantity: 5, price: 100 }],
    }).expect(201);
    const saleId = saleResponse.body.id as string;
    const saleProductId = saleResponse.body.products[0].id as string;

    expect(saleResponse.body).toMatchObject({
      type: 'SALE',
      status: 'PENDING',
      relatedOrderId: null,
      totalSale: '500.000000',
      totalCost: '300.000000',
      numProducts: 5,
    });
    expect(await getBalance(originalVariantId)).toBe(5);
    expect(await getBalance(originalVariantId, 'RESERVED')).toBe(5);

    const completedSale = await post(`/${saleId}/complete`).expect(200);
    expect(completedSale.body.status).toBe('COMPLETED');
    expect(await getBalance(originalVariantId)).toBe(5);
    expect(await getBalance(originalVariantId, 'RESERVED')).toBe(0);
    expect(await getMovements(saleId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'RESERVATION', quantity: 5 }),
        expect.objectContaining({ type: 'SALE', fromBucket: 'RESERVED', quantity: 5 }),
      ]),
    );

    const exchangeResponse = await post('', {
      type: 'EXCHANGE',
      relatedOrderId: saleId,
      salesChannelId,
      products: [
        { variantId: originalVariantId, type: 'RETURN', quantity: 2 },
        { variantId: exchangeVariantId, type: 'SALE', quantity: 2, price: 100 },
      ],
    }).expect(201);
    const exchangeId = exchangeResponse.body.id as string;
    const exchangeReturnId = exchangeResponse.body.products.find(
      (product: { type: string }) => product.type === 'RETURN',
    ).id as string;
    expect(exchangeResponse.body).toMatchObject({
      type: 'EXCHANGE',
      status: 'PENDING',
      relatedOrderId: saleId,
      totalSale: '0.000000',
      totalCost: '0.000000',
      numProducts: 0,
    });
    expect(await getBalance(originalVariantId)).toBe(5);
    expect(await getBalance(exchangeVariantId)).toBe(10);

    const completedExchange = await post(`/${exchangeId}/complete`, {
      items: [{ orderProductId: exchangeReturnId, condition: 'AVAILABLE', quantity: 2 }],
    }).expect(200);
    expect(completedExchange.body.status).toBe('COMPLETED');
    expect(await getBalance(originalVariantId)).toBe(7);
    expect(await getBalance(exchangeVariantId)).toBe(8);
    expect(await getMovements(exchangeId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'RETURN', toBucket: 'AVAILABLE', quantity: 2 }),
        expect.objectContaining({ type: 'SALE', fromBucket: 'AVAILABLE', quantity: 2 }),
      ]),
    );

    const returnResponse = await post('', {
      type: 'RETURN',
      relatedOrderId: saleId,
      salesChannelId,
      fullReturn: true,
    }).expect(201);
    const returnId = returnResponse.body.id as string;
    expect(returnResponse.body).toMatchObject({
      type: 'RETURN',
      status: 'PENDING',
      relatedOrderId: saleId,
      totalSale: '300.000000',
      totalCost: '180.000000',
      numProducts: 3,
    });
    expect(returnResponse.body.products).toEqual([
      expect.objectContaining({ variantId: originalVariantId, type: 'RETURN', quantity: 3, price: '100.000000' }),
    ]);
    expect(await getBalance(originalVariantId)).toBe(7);

    const completedReturn = await post(`/${returnId}/complete`).expect(200);
    expect(completedReturn.body.status).toBe('COMPLETED');
    expect(await getBalance(originalVariantId)).toBe(10);
    expect(await getBalance(exchangeVariantId)).toBe(8);
    expect(await getMovements(returnId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'RETURN', toBucket: 'AVAILABLE', quantity: 3 })]),
    );

    const [sale, exchange, returned] = await Promise.all([getOrder(saleId), getOrder(exchangeId), getOrder(returnId)]);
    expect(sale.body).toMatchObject({ id: saleId, type: 'SALE', status: 'COMPLETED', relatedOrderId: null });
    expect(sale.body.products).toEqual([
      expect.objectContaining({ id: saleProductId, variantId: originalVariantId, type: 'SALE', quantity: 5 }),
    ]);
    expect(exchange.body).toMatchObject({
      id: exchangeId,
      type: 'EXCHANGE',
      status: 'COMPLETED',
      relatedOrderId: saleId,
    });
    expect(returned.body).toMatchObject({ id: returnId, type: 'RETURN', status: 'COMPLETED', relatedOrderId: saleId });

    const now = new Date();
    const summary = await new StatsService().salesSummary({
      view: 'range',
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      channelId: salesChannelId,
    });
    expect(summary.summary).toMatchObject({
      ordersCount: '3',
      totalRevenue: '200.000000',
      totalCost: '120.000000',
      totalProfit: '80.000000',
    });
  });
});
