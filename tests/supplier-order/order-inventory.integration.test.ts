import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { and, eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routerApp } from '@/app/router';
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
import { resetSupplierTestSchema } from './database';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.response.sendSuccess = sendSuccess;
app.response.sendError = sendError;
app.use('/api', routerApp());
app.use(errorHandler);
let userId: string;
let cookie: string;
let salesChannelId: number;
let variantIds: number[];
let code = 0;
beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Order', lastName: 'Inventory', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  cookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'employee' })}`;
  const [channel] = await db
    .insert(salesChannelTable)
    .values({ channel: tag.slice(0, 25), createdBy: userId })
    .returning();
  salesChannelId = channel.id;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      [0, 1, 2].map(() => ({
        productId: product.id,
        code: String(++code).padStart(5, '0'),
        price: '100.000000',
        purchasePrice: '60.000000',
        createdBy: userId,
      })),
    )
    .returning();
  variantIds = variants.map((variant) => variant.id);
  await db.insert(inventoryBalanceTable).values(
    variantIds.map((productVariantId) => ({
      productVariantId,
      bucket: 'AVAILABLE' as const,
      quantity: 10,
      updatedBy: userId,
    })),
  );
});
const post = (path: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/orders${path}`).set('Cookie', cookie).send(body);
const patch = (id: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/orders/${id}`).set('Cookie', cookie).send(body);
const saleLine = (quantity = 3, variantId = variantIds[0]) => ({ variantId, type: 'SALE', quantity, price: 100 });
const sale = (changes: Record<string, unknown> = {}) =>
  post('', { type: 'SALE', salesChannelId, client: { contactName: 'Cliente' }, products: [saleLine()], ...changes });
const returnOrder = (relatedOrderId: string, products: { variantId: number; quantity: number }[]) =>
  post('', {
    type: 'RETURN',
    relatedOrderId,
    salesChannelId,
    fullReturn: false,
    products: products.map((product) => ({ ...product, type: 'RETURN' })),
  });
const entries = (orderId: string) =>
  db.select().from(stockMovementTable).where(eq(stockMovementTable.orderId, orderId));
const balance = async (bucket: 'AVAILABLE' | 'RESERVED' | 'QUARANTINE' | 'DEFECTIVE', variantId = variantIds[0]) => {
  const [row] = await db
    .select()
    .from(inventoryBalanceTable)
    .where(and(eq(inventoryBalanceTable.productVariantId, variantId), eq(inventoryBalanceTable.bucket, bucket)));
  return row?.quantity ?? 0;
};
const variant = (id = variantIds[0]) =>
  db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, id) });

describe('ventas conectadas con inventoryBalance', () => {
  it('reserva desde PENDING, conserva la reserva al pagar y entrega una sola vez', async () => {
    const created = await sale().expect(201);
    const id = created.body.id;
    expect(await balance('AVAILABLE')).toBe(7);
    expect(await balance('RESERVED')).toBe(3);
    await patch(id, { status: 'PAID' }).expect(200);
    expect(await entries(id)).toHaveLength(1);
    await request(app).post(`/api/orders/${id}/complete`).set('Cookie', cookie).expect(200);
    expect(await balance('AVAILABLE')).toBe(7);
    expect(await balance('RESERVED')).toBe(0);
    expect(await entries(id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'RESERVATION', quantity: 3 }),
        expect.objectContaining({ type: 'SALE', fromBucket: 'RESERVED', quantity: 3, unitCostPen: '60.000000' }),
      ]),
    );
    await post(`/${id}/complete`).expect(409);
    await post(`/${id}/cancel`).expect(409);
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
  });
  it('crea una venta entregada con reserva y salida en la misma transacción', async () => {
    const created = await sale({ status: 'COMPLETED' }).expect(201);
    expect(created.body.status).toBe('COMPLETED');
    expect(await balance('AVAILABLE')).toBe(7);
    expect(await balance('RESERVED')).toBe(0);
    expect(await entries(created.body.id)).toHaveLength(2);
  });
  it('edita cantidades sin borrar historial ni cambiar el costo histórico y libera al cancelar', async () => {
    const created = await sale().expect(201);
    const id = created.body.id;
    const lineId = created.body.products[0].id;
    const [originalMovement] = await entries(id);
    await db
      .update(productVariantTable)
      .set({ purchasePrice: '90.000000' })
      .where(eq(productVariantTable.id, variantIds[0]));
    const updated = await patch(id, { products: [{ ...saleLine(5), price: 110 }] }).expect(200);
    expect(updated.body.products[0]).toMatchObject({ id: lineId, quantity: 5, purchasePrice: '60.000000' });
    expect(updated.body.totalCost).toBe('300.000000');
    expect(await entries(id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: originalMovement.id, quantity: 3 })]),
    );
    expect(await entries(id)).toHaveLength(2);
    await post(`/${id}/cancel`).expect(200);
    await post(`/${id}/cancel`).expect(409);
    expect(await balance('AVAILABLE')).toBe(10);
    expect(await balance('RESERVED')).toBe(0);
    expect(await entries(id)).toHaveLength(3);
    expect(await variant()).toMatchObject({ purchasePrice: '90.000000' });
  });
  it('libera variantes retiradas y reserva las nuevas al editar', async () => {
    const created = await sale().expect(201);
    await patch(created.body.id, { products: [saleLine(4, variantIds[1])] }).expect(200);
    expect(await balance('AVAILABLE')).toBe(10);
    expect(await balance('RESERVED')).toBe(0);
    expect(await balance('AVAILABLE', variantIds[1])).toBe(6);
    expect(await balance('RESERVED', variantIds[1])).toBe(4);
    expect(await entries(created.body.id)).toHaveLength(3);
  });
  it('no vende más que AVAILABLE y serializa reservas concurrentes', async () => {
    await sale({ products: [saleLine(11)] }).expect(409);
    const results = await Promise.all([sale({ products: [saleLine(8)] }), sale({ products: [saleLine(8)] })]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await balance('AVAILABLE')).toBe(2);
    expect(await balance('RESERVED')).toBe(8);
  });
  it('exige cancelar antes de eliminar para evitar dejar reservas sin liberar', async () => {
    const created = await sale().expect(201);
    await request(app).delete(`/api/orders/${created.body.id}`).set('Cookie', cookie).expect(409);
    await post(`/${created.body.id}/cancel`).expect(200);
    await request(app).delete(`/api/orders/${created.body.id}`).set('Cookie', cookie).expect(200);
    expect(await balance('AVAILABLE')).toBe(10);
  });
  it('rechaza líneas RETURN dentro de una venta y condiciones de devolución al entregar una venta', async () => {
    await sale({ products: [saleLine(), { variantId: variantIds[1], type: 'RETURN', quantity: 1 }] }).expect(400);
    const created = await sale().expect(201);
    await post(`/${created.body.id}/complete`, {
      items: [{ orderProductId: created.body.products[0].id, condition: 'AVAILABLE', quantity: 1 }],
    }).expect(400);
    expect(await balance('RESERVED')).toBe(3);
  });
});

describe('condición por ítem devuelto', () => {
  it('divide tres unidades de una línea en dos aptas y una en revisión', async () => {
    const source = await sale({ status: 'COMPLETED' }).expect(201);
    await db
      .update(productVariantTable)
      .set({ purchasePrice: '90.000000' })
      .where(eq(productVariantTable.id, variantIds[0]));
    const returned = await returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 3 }]).expect(201);
    const orderProductId = returned.body.products[0].id;
    const items = [
      { orderProductId, condition: 'AVAILABLE', quantity: 2 },
      { orderProductId, condition: 'QUARANTINE', quantity: 1 },
    ];
    const completed = await post(`/${returned.body.id}/complete`, { items }).expect(200);
    expect(completed.body.products[0].returnConditions).toEqual(
      expect.arrayContaining([
        { condition: 'AVAILABLE', quantity: 2 },
        { condition: 'QUARANTINE', quantity: 1 },
      ]),
    );
    expect(completed.body.products[0].returnConditions).toHaveLength(2);
    expect(await balance('AVAILABLE')).toBe(9);
    expect(await balance('QUARANTINE')).toBe(1);
    expect(await variant()).toMatchObject({ purchasePrice: '83.333333' });
    expect(await entries(returned.body.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toBucket: 'AVAILABLE', quantity: 2, unitCostPen: '60.000000' }),
        expect.objectContaining({ toBucket: 'QUARANTINE', quantity: 1, unitCostPen: '60.000000' }),
      ]),
    );
    await post(`/${returned.body.id}/complete`, { items }).expect(409);
    expect(await entries(returned.body.id)).toHaveLength(2);
  });

  it('rechaza distribuciones incompletas, excesivas y cantidades inválidas sin cambios parciales', async () => {
    const source = await sale({ status: 'COMPLETED' }).expect(201);
    const returned = await returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 3 }]).expect(201);
    const item = { orderProductId: returned.body.products[0].id, condition: 'AVAILABLE' };
    for (const quantity of [undefined, 0, -1, 1.5, 2, 4, 2147483648]) {
      await post(`/${returned.body.id}/complete`, { items: [{ ...item, quantity }] }).expect(400);
    }
    await post(`/${returned.body.id}/complete`, {
      items: [
        { ...item, quantity: 2 },
        { ...item, quantity: 1 },
      ],
    }).expect(400);
    expect(await entries(returned.body.id)).toHaveLength(0);
    expect(await balance('AVAILABLE')).toBe(7);
    expect(await variant()).toMatchObject({ purchasePrice: '60.000000' });
  });
  it('recibe cada línea en su condición y solo pondera las unidades vendibles con su costo original', async () => {
    const source = await sale({ status: 'COMPLETED', products: variantIds.map((id) => saleLine(2, id)) }).expect(201);
    for (const id of variantIds)
      await db.update(productVariantTable).set({ purchasePrice: '90.000000' }).where(eq(productVariantTable.id, id));
    const returned = await returnOrder(
      source.body.id,
      variantIds.map((variantId) => ({ variantId, quantity: 1 })),
    ).expect(201);
    expect(await entries(returned.body.id)).toHaveLength(0);
    const conditions = ['AVAILABLE', 'QUARANTINE', 'DEFECTIVE'];
    const items = variantIds.map((id, index) => ({
      orderProductId: returned.body.products.find((product: { variantId: number }) => product.variantId === id).id,
      condition: conditions[index],
      quantity: 1,
    }));
    const completed = await post(`/${returned.body.id}/complete`, { items }).expect(200);
    expect(
      completed.body.products
        .flatMap((product: { returnConditions: { condition: string }[] }) =>
          product.returnConditions.map((item) => item.condition),
        )
        .sort(),
    ).toEqual([...conditions].sort());
    expect(await balance('AVAILABLE')).toBe(9);
    expect(await balance('AVAILABLE', variantIds[1])).toBe(8);
    expect(await balance('QUARANTINE', variantIds[1])).toBe(1);
    expect(await balance('DEFECTIVE', variantIds[2])).toBe(1);
    expect(await variant()).toMatchObject({ purchasePrice: '86.666667' });
    expect(await variant(variantIds[1])).toMatchObject({ purchasePrice: '90.000000' });
    expect(await variant(variantIds[2])).toMatchObject({ purchasePrice: '90.000000' });
    expect(
      (await entries(returned.body.id)).every(
        (movement) => movement.unitCostPen === '60.000000' && movement.createdBy === userId,
      ),
    ).toBe(true);
    await post(`/${returned.body.id}/complete`, { items }).expect(409);
  });
  it('admite devolución total de lo restante y exige condiciones para todas las líneas generadas', async () => {
    const source = await sale({ status: 'COMPLETED' }).expect(201);
    const partial = await returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 1 }]).expect(201);
    await post(`/${partial.body.id}/complete`, {
      items: [{ orderProductId: partial.body.products[0].id, condition: 'DEFECTIVE', quantity: 1 }],
    }).expect(200);
    const full = await post('', {
      type: 'RETURN',
      relatedOrderId: source.body.id,
      salesChannelId,
      fullReturn: true,
    }).expect(201);
    expect(full.body.products[0].quantity).toBe(2);
    await post(`/${full.body.id}/complete`).expect(400);
    await post(`/${full.body.id}/complete`, {
      items: [{ orderProductId: full.body.products[0].id, condition: 'AVAILABLE', quantity: 2 }],
    }).expect(200);
    expect(await balance('AVAILABLE')).toBe(9);
    expect(await balance('DEFECTIVE')).toBe(1);
    await returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 1 }]).expect(409);
  });
  it('rechaza condiciones omitidas, repetidas, ajenas o inválidas sin alterar existencias', async () => {
    const source = await sale({ status: 'COMPLETED' }).expect(201);
    const returned = await returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 1 }]).expect(201);
    const item = { orderProductId: returned.body.products[0].id, condition: 'AVAILABLE', quantity: 1 };
    for (const body of [
      {},
      { items: [] },
      { items: [item, item] },
      { items: [{ ...item, orderProductId: randomUUID() }] },
      { items: [{ ...item, condition: 'RESERVED' }] },
    ]) {
      await post(`/${returned.body.id}/complete`, body).expect(400);
    }
    expect(await entries(returned.body.id)).toHaveLength(0);
    expect(await balance('AVAILABLE')).toBe(7);
  });
  it('cancela devoluciones pendientes sin sumar ni liberar inventario', async () => {
    const source = await sale({ status: 'COMPLETED' }).expect(201);
    const returned = await returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 1 }]).expect(201);
    await post(`/${returned.body.id}/cancel`).expect(200);
    expect(await entries(returned.body.id)).toHaveLength(0);
    expect(await balance('AVAILABLE')).toBe(7);
  });
  it('serializa devoluciones pendientes que compiten por la misma venta original', async () => {
    const source = await sale({ status: 'COMPLETED' }).expect(201);
    const results = await Promise.all([
      returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 2 }]),
      returnOrder(source.body.id, [{ variantId: variantIds[0], quantity: 2 }]),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
  it.each([false, true])('completa el cambio atómicamente; falta de stock al entregar: %s', async (outOfStock) => {
    const source = await sale({ status: 'COMPLETED', products: [saleLine(3)] }).expect(201);
    const exchange = await post('', {
      type: 'EXCHANGE',
      relatedOrderId: source.body.id,
      salesChannelId,
      products: [{ variantId: variantIds[0], type: 'RETURN', quantity: 3 }, saleLine(2, variantIds[1])],
    }).expect(201);
    expect(await balance('AVAILABLE', variantIds[1])).toBe(10);
    if (outOfStock)
      await db
        .update(inventoryBalanceTable)
        .set({ quantity: 0 })
        .where(
          and(eq(inventoryBalanceTable.productVariantId, variantIds[1]), eq(inventoryBalanceTable.bucket, 'AVAILABLE')),
        );
    const returned = exchange.body.products.find((product: { type: string }) => product.type === 'RETURN');
    await post(`/${exchange.body.id}/complete`, {
      items: [
        { orderProductId: returned.id, condition: 'QUARANTINE', quantity: 1 },
        { orderProductId: returned.id, condition: 'AVAILABLE', quantity: 2 },
      ],
    }).expect(outOfStock ? 409 : 200);
    expect(await balance('QUARANTINE')).toBe(outOfStock ? 0 : 1);
    expect(await balance('AVAILABLE')).toBe(outOfStock ? 7 : 9);
    expect(await entries(exchange.body.id)).toHaveLength(outOfStock ? 0 : 3);
    if (!outOfStock) expect(await balance('AVAILABLE', variantIds[1])).toBe(8);
  });
});
