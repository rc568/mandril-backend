import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routerApp } from '@/app/router';
import {
  db,
  productTable,
  productVariantTable,
  supplierOrderProductTable,
  supplierOrderTable,
  userTable,
} from '@/shared/db';
import { Jwt } from '@/shared/libs/jwt';
import { errorHandler } from '@/shared/middlewares';
import { sendError, sendSuccess } from '@/shared/utils/api-response';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

// Exercise the application's route registration, real JWTs, validation and PostgreSQL.
const app = express();
app.use(express.json());
app.use(cookieParser());
app.response.sendSuccess = sendSuccess;
app.response.sendError = sendError;
app.use('/api', routerApp());
app.use(errorHandler);

let userId: string;
let cookie: string;
let adminCookie: string;
let supplierId: string;
let variantId: number;
let tag: string;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Compras',
      lastName: 'HTTP',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  userId = user.id;
  cookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'employee' })}`;
  adminCookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'admin' })}`;
  const supplier = await request(app).post('/api/suppliers').set('Cookie', cookie).send({ name: tag }).expect(201);
  supplierId = supplier.body.id;
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
});

const purchaseInput = () => ({
  supplierId,
  currency: 'USD',
  supplierPaymentAmount: 100,
  products: [{ productVariantId: variantId, type: 'PURCHASE', quantityOrdered: 2, unitPrice: 40 }],
});
const createPurchase = async () => {
  const response = await request(app)
    .post('/api/supplier-orders')
    .set('Cookie', cookie)
    .send(purchaseInput())
    .expect(201);
  return response.body;
};

describe('API de proveedores y compras', () => {
  it('guarda y consulta includesIgv, permite editarlo antes de recibir y respeta el bloqueo posterior', async () => {
    const created = await request(app)
      .post('/api/supplier-orders')
      .set('Cookie', cookie)
      .send({ ...purchaseInput(), includesIgv: true })
      .expect(201);
    const path = `/api/supplier-orders/${created.body.id}`;
    expect(created.body.includesIgv).toBe(true);
    const detail = await request(app).get(path).set('Cookie', cookie).expect(200);
    expect(detail.body.includesIgv).toBe(true);
    const edited = await request(app).patch(path).set('Cookie', cookie).send({ includesIgv: false }).expect(200);
    expect(edited.body.includesIgv).toBe(false);
    await db
      .update(supplierOrderTable)
      .set({ status: 'PARTIALLY_RECEIVED' })
      .where(eq(supplierOrderTable.id, created.body.id));
    await request(app).patch(path).set('Cookie', cookie).send({ includesIgv: true }).expect(409);
  });
  it('define el tipo proyectado después de revisar sin calcular costos ni desbloquear la compra', async () => {
    const purchase = await createPurchase();
    const path = `/api/supplier-orders/${purchase.id}`;
    await db
      .update(supplierOrderTable)
      .set({ status: 'RECEIVED', reviewStatus: 'COMPLETED' })
      .where(eq(supplierOrderTable.id, purchase.id));
    const result = await request(app)
      .patch(`${path}/projected-exchange-rate`)
      .set('Cookie', cookie)
      .send({ projectedExchangeRate: 3.8 })
      .expect(200);
    expect(result.body).toMatchObject({ projectedExchangeRate: '3.800000', updatedBy: userId, status: 'RECEIVED' });
    expect(result.body.products[0]).toMatchObject({ calculatedUnitCost: null, calculatedUnitCostPen: null });
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ purchasePrice: '60.000000' });
    await request(app).patch(path).set('Cookie', cookie).send({ supplierPaymentAmount: 500 }).expect(409);
    await request(app)
      .patch(`${path}/projected-exchange-rate`)
      .set('Cookie', cookie)
      .send({ projectedExchangeRate: null })
      .expect(200);
  });

  it('valida el tipo proyectado y permite cambiarlo antes del ingreso por ambas rutas', async () => {
    const purchase = await createPurchase();
    const path = `/api/supplier-orders/${purchase.id}`;
    for (const body of [
      {},
      { projectedExchangeRate: 0 },
      { projectedExchangeRate: 0.0000001 },
      { projectedExchangeRate: 3.8, supplierPaymentAmount: 500 },
    ]) {
      await request(app).patch(`${path}/projected-exchange-rate`).set('Cookie', cookie).send(body).expect(400);
    }
    await db
      .update(supplierOrderProductTable)
      .set({ calculatedUnitCost: '47.000000' })
      .where(eq(supplierOrderProductTable.id, purchase.products[0].id));
    await request(app)
      .patch(`${path}/projected-exchange-rate`)
      .set('Cookie', cookie)
      .send({ projectedExchangeRate: 3.8 })
      .expect(200);
    await request(app).patch(path).set('Cookie', cookie).send({ projectedExchangeRate: 3.9 }).expect(200);
    expect(
      await db.query.supplierOrderProductTable.findFirst({
        where: eq(supplierOrderProductTable.id, purchase.products[0].id),
      }),
    ).toMatchObject({ calculatedUnitCost: '47.000000', calculatedUnitCostPen: null });
  });

  it.each(['CANCELLED', 'LEGACY_IMPORT'] as const)('no modifica el tipo de cambio de %s', async (state) => {
    const purchase = await createPurchase();
    await db
      .update(supplierOrderTable)
      .set(state === 'CANCELLED' ? { status: state } : { recordOrigin: state })
      .where(eq(supplierOrderTable.id, purchase.id));
    await request(app)
      .patch(`/api/supplier-orders/${purchase.id}/projected-exchange-rate`)
      .set('Cookie', cookie)
      .send({ projectedExchangeRate: 3.8 })
      .expect(409);
  });
  it('consulta y desactiva proveedores usando filtros validados', async () => {
    const detail = await request(app).get(`/api/suppliers/${supplierId}`).set('Cookie', adminCookie).expect(200);
    expect(detail.body).toMatchObject({ id: supplierId, createdBy: userId, isActive: true });
    await request(app)
      .patch(`/api/suppliers/${supplierId}`)
      .set('Cookie', adminCookie)
      .send({ isActive: false })
      .expect(200);
    const listing = await request(app)
      .get('/api/suppliers')
      .set('Cookie', cookie)
      .query({ search: tag, isActive: 'false' })
      .expect(200);
    expect(listing.body.suppliers.map((s: { id: string }) => s.id)).toEqual([supplierId]);
    await request(app).post('/api/supplier-orders').set('Cookie', cookie).send(purchaseInput()).expect(409);
  });

  it('crea, consulta, edita y envía una compra sin exigir tracking', async () => {
    const purchase = await createPurchase();
    expect(purchase).toMatchObject({ status: 'PREPARING', createdBy: userId, supplierPaymentAmount: '100.000000' });
    const path = `/api/supplier-orders/${purchase.id}`;
    const updated = await request(app)
      .patch(path)
      .set('Cookie', cookie)
      .send({
        products: [{ ...purchaseInput().products[0], id: purchase.products[0].id, quantityOrdered: 3 }],
      })
      .expect(200);
    expect(updated.body.products[0]).toMatchObject({ id: purchase.products[0].id, subtotalPrice: '120.000000' });
    await request(app).post(`${path}/in-transit`).set('Cookie', cookie).expect(200);
    const detail = await request(app).get(path).set('Cookie', cookie).expect(200);
    expect(detail.body).toMatchObject({ status: 'IN_TRANSIT', trackingNumber: null });
    const list = await request(app)
      .get('/api/supplier-orders')
      .set('Cookie', cookie)
      .query({ supplierId, status: 'IN_TRANSIT', page: '1', limit: '24' })
      .expect(200);
    expect(list.body.orders.map((o: { id: string }) => o.id)).toEqual([purchase.id]);
    await request(app).post(`${path}/cancel`).set('Cookie', cookie).expect(409);
  });

  it('cancela desde preparación y bloquea ediciones posteriores', async () => {
    const purchase = await createPurchase();
    const path = `/api/supplier-orders/${purchase.id}`;
    const cancelled = await request(app).post(`${path}/cancel`).set('Cookie', adminCookie).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    await request(app).patch(path).set('Cookie', cookie).send({ observation: 'Cambio' }).expect(409);
  });

  it('opera gastos mediante sus endpoints y conserva los importes exactos', async () => {
    const purchase = await createPurchase();
    const path = `/api/supplier-orders/${purchase.id}`;
    const created = await request(app)
      .post(`${path}/expenses`)
      .set('Cookie', cookie)
      .send({ type: 'LOCAL_FREIGHT', amountUsd: 44, amountPen: 166.32 })
      .expect(201);
    expect(created.body).toMatchObject({ amountUsd: '44.000000', amountPen: '166.320000', createdBy: userId });
    const expensePath = `${path}/expenses/${created.body.id}`;
    const updated = await request(app).patch(expensePath).set('Cookie', cookie).send({ amountUsd: null }).expect(200);
    expect(updated.body).toMatchObject({ amountUsd: null, amountPen: '166.320000', updatedBy: userId });
    await request(app).patch(expensePath).set('Cookie', cookie).send({ amountPen: null }).expect(400);
    const detail = await request(app).get(path).set('Cookie', cookie).expect(200);
    expect(detail.body.expenses).toHaveLength(1);
    await request(app).delete(expensePath).set('Cookie', cookie).expect(200, 'null');
    await request(app).delete(expensePath).set('Cookie', cookie).expect(404);
  });

  it('no permite editar un gasto desde otra compra', async () => {
    const first = await createPurchase();
    const second = await createPurchase();
    const expense = await request(app)
      .post(`/api/supplier-orders/${first.id}/expenses`)
      .set('Cookie', cookie)
      .send({ type: 'CUSTOMS_TAXES', amountPen: 30 })
      .expect(201);
    const wrongPath = `/api/supplier-orders/${second.id}/expenses/${expense.body.id}`;
    await request(app).patch(wrongPath).set('Cookie', cookie).send({ amountPen: 50 }).expect(404);
    await request(app).delete(wrongPath).set('Cookie', cookie).expect(404);
  });

  it('protege todas las rutas incluso las consultas', async () => {
    const id = randomUUID();
    const paths = [
      ['get', '/suppliers'],
      ['get', `/suppliers/${id}`],
      ['post', '/suppliers'],
      ['patch', `/suppliers/${id}`],
      ['get', '/supplier-orders'],
      ['get', `/supplier-orders/${id}`],
      ['post', '/supplier-orders'],
      ['patch', `/supplier-orders/${id}`],
      ['post', `/supplier-orders/${id}/in-transit`],
      ['post', `/supplier-orders/${id}/cancel`],
      ['post', `/supplier-orders/${id}/expenses`],
      ['patch', `/supplier-orders/${id}/expenses/${id}`],
      ['delete', `/supplier-orders/${id}/expenses/${id}`],
    ] as const;
    const unauthorizedRole = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'customer' })}`;
    for (const [method, path] of paths) {
      await request(app)[method](`/api${path}`).expect(401);
      await request(app)[method](`/api${path}`).set('Cookie', unauthorizedRole).expect(403);
    }
    await request(app).get('/api/supplier-orders').set('Cookie', 'accessToken=invalid').expect(401);
  });

  it('rechaza UUID, filtros, importes y campos de compra inválidos', async () => {
    await request(app).get('/api/suppliers/not-a-uuid').set('Cookie', cookie).expect(400);
    await request(app).get('/api/supplier-orders').set('Cookie', cookie).query({ status: 'INVALID' }).expect(400);
    await request(app).get('/api/suppliers').set('Cookie', cookie).query({ isActive: 'yes' }).expect(400);
    const purchase = await createPurchase();
    const path = `/api/supplier-orders/${purchase.id}`;
    await request(app).patch(path).set('Cookie', cookie).send({ status: 'RECEIVED' }).expect(400);
    await request(app).patch(path).set('Cookie', cookie).send({ expenses: [] }).expect(400);
    const invalid = await request(app)
      .post(`${path}/expenses`)
      .set('Cookie', cookie)
      .send({ type: 'LOCAL_FREIGHT', amountUsd: 0.0000001 })
      .expect(400);
    expect(invalid.body.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'amountUsd' })]),
    );
    await request(app).patch(`${path}/expenses/not-a-uuid`).set('Cookie', cookie).send({ amountUsd: 1 }).expect(400);
    expect(
      (await db.query.supplierOrderTable.findFirst({ where: eq(supplierOrderTable.id, purchase.id) }))?.status,
    ).toBe('PREPARING');
  });

  it('devuelve 400 para cuerpos vacíos o ausentes y 404 para compras inexistentes', async () => {
    const purchase = await createPurchase();
    for (const path of ['/api/suppliers', '/api/supplier-orders', `/api/supplier-orders/${purchase.id}/expenses`]) {
      await request(app).post(path).set('Cookie', cookie).expect(400);
      await request(app).post(path).set('Cookie', cookie).send({}).expect(400);
    }
    await request(app).get(`/api/supplier-orders/${randomUUID()}`).set('Cookie', cookie).expect(404);
  });
});
