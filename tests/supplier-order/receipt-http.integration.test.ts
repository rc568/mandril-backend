import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const basePath = (id: string) => `/api/supplier-orders/${id}`;
const command = (path: string, body: Record<string, unknown> = {}) =>
  request(app).post(path).set('Cookie', cookie).send(body);
const balance = () =>
  db
    .insert(inventoryBalanceTable)
    .values({ productVariantId: variantId, bucket: 'AVAILABLE', quantity: 10, updatedBy: userId });

describe('API de recepción, revisión, incidencias y costos', () => {
  it('ingresa 10 y luego 5 unidades por HTTP, incluso antes del cierre de la recepción', async () => {
    await balance();
    const created = await command('/api/supplier-orders', {
      ...purchaseInput(),
      projectedExchangeRate: 3.4,
      supplierPaymentAmount: 180,
      products: [{ productVariantId: variantId, type: 'PURCHASE', quantityOrdered: 15, unitPrice: 10 }],
    }).expect(201);
    const purchase = created.body;
    const path = basePath(purchase.id);
    await command(`${path}/expenses`, { type: 'INTERNATIONAL_SHIPPING', amountUsd: 30, amountPen: 105 }).expect(201);
    const first = await request(app).post(`${path}/receipts`).set('Cookie', cookie).expect(201);
    expect(first.body).toMatchObject({ sequenceNumber: 1, receivedBy: userId, reviewStatus: 'PENDING' });
    const firstPath = `${path}/receipts/${first.body.id}`;
    await command(`${firstPath}/post-to-inventory`).expect(409);
    const review = await command(`${firstPath}/review`, {
      items: [{ supplierOrderProductId: purchase.products[0].id, availableQuantity: 10 }],
    }).expect(200);
    expect(review.body).toMatchObject({ reviewedBy: userId, reviewStatus: 'COMPLETED' });
    await command(`${firstPath}/post-to-inventory`).expect(409);
    const calculated = await command(`${path}/calculate-costs`).expect(200);
    expect(calculated.body[0]).toMatchObject({ calculatedUnitCost: '12.000000', calculatedUnitCostPen: '48.144000' });
    const posted = await command(`${firstPath}/post-to-inventory`).expect(200);
    expect(posted.body).toEqual({ receiptId: first.body.id, inventoryPosted: true });
    expect((await request(app).get(path).set('Cookie', cookie).expect(200)).body.status).toBe('PARTIALLY_RECEIVED');
    const detail = await request(app).get(firstPath).set('Cookie', cookie).expect(200);
    expect(detail.body.inventoryPosted).toBe(true);
    expect(detail.body.items[0]).toMatchObject({
      availableQuantity: 10,
      supplierOrderProductId: purchase.products[0].id,
    });

    const second = await command(`${path}/receipts`).expect(201);
    const secondPath = `${path}/receipts/${second.body.id}`;
    await command(`${secondPath}/review`, {
      items: [{ supplierOrderProductId: purchase.products[0].id, availableQuantity: 5 }],
    }).expect(200);
    const closed = await command(`${path}/close-receiving`).expect(200);
    expect(closed.body).toMatchObject({ status: 'RECEIVED', receivingClosedBy: userId, reviewStatus: 'COMPLETED' });
    await command(`${secondPath}/post-to-inventory`).expect(200);
    await command(`${firstPath}/post-to-inventory`).expect(409);
    await command(`${path}/calculate-costs`).expect(409);
    const list = await request(app).get(`${path}/receipts`).set('Cookie', cookie).expect(200);
    expect(list.body.map((receipt: { inventoryPosted: boolean }) => receipt.inventoryPosted)).toEqual([true, true]);
    const movements = await db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, purchase.id));
    expect(movements).toHaveLength(2);
    expect(movements.every((movement) => movement.unitCostPen === '48.144000' && movement.createdBy === userId)).toBe(
      true,
    );
    expect(movements.reduce((sum, movement) => sum + movement.quantity, 0)).toBe(15);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ purchasePrice: '52.886400' });
  });

  it('registra una incidencia, recibe su compensación con costo original y cierra con auditoría', async () => {
    await balance();
    const source = await createPurchase();
    const path = basePath(source.id);
    await request(app)
      .patch(`${path}/projected-exchange-rate`)
      .set('Cookie', cookie)
      .send({ projectedExchangeRate: 3.4 })
      .expect(200);
    const receipt = await command(`${path}/receipts`).expect(201);
    const reviewed = await command(`${path}/receipts/${receipt.body.id}/review`, {
      items: [{ supplierOrderProductId: source.products[0].id, availableQuantity: 1, defectiveQuantity: 1 }],
    }).expect(200);
    const created = await command(`${path}/issues`, {
      type: 'DEFECTIVE',
      receiptItemId: reviewed.body.items[0].id,
      quantity: 1,
      description: '  Cámara defectuosa  ',
    }).expect(201);
    expect(created.body).toMatchObject({
      description: 'Cámara defectuosa',
      createdBy: userId,
      supplierOrderProductId: source.products[0].id,
    });
    await command(`${path}/calculate-costs`).expect(200);
    const replacement = await command('/api/supplier-orders', {
      supplierId,
      type: 'COMPENSATION',
      currency: 'USD',
      supplierPaymentAmount: 0,
      products: [{ productVariantId: variantId, type: 'COMPENSATION', quantityOrdered: 1, unitPrice: 0 }],
    }).expect(201);
    const replacementPath = basePath(replacement.body.id);
    const arrival = await command(`${replacementPath}/receipts`).expect(201);
    const arrivalPath = `${replacementPath}/receipts/${arrival.body.id}`;
    await command(`${arrivalPath}/review`, {
      items: [
        {
          supplierOrderProductId: replacement.body.products[0].id,
          sourceIssueId: created.body.id,
          availableQuantity: 1,
        },
      ],
    }).expect(200);
    await command(`${arrivalPath}/post-to-inventory`).expect(200);
    const movements = await db
      .select()
      .from(stockMovementTable)
      .where(eq(stockMovementTable.purchaseId, replacement.body.id));
    expect(movements[0]).toMatchObject({ quantity: 1, unitCostPen: '160.480000' });
    const closed = await command(`${path}/issues/${created.body.id}/close`, {
      resolutionNote: '  Reemplazo recibido  ',
    }).expect(200);
    expect(closed.body).toMatchObject({ status: 'CLOSED', closedBy: userId, resolutionNote: 'Reemplazo recibido' });
    await command(`${path}/issues/${created.body.id}/close`, { resolutionNote: 'Repetido' }).expect(409);
    const issues = await request(app).get(`${path}/issues`).set('Cookie', cookie).expect(200);
    expect(issues.body).toHaveLength(1);
    expect(issues.body[0].status).toBe('CLOSED');
  });

  it('rechaza cantidades y campos reservados sin registrar revisiones o ingresos', async () => {
    const purchase = await createPurchase();
    const path = basePath(purchase.id);
    for (const body of [{ sequenceNumber: 5 }, { receivedBy: randomUUID() }, { receivedAt: 'invalid' }]) {
      await command(`${path}/receipts`, body).expect(400);
    }
    const receipt = await command(`${path}/receipts`).expect(201);
    const receiptPath = `${path}/receipts/${receipt.body.id}`;
    for (const body of [
      {},
      { items: [] },
      { items: [{ supplierOrderProductId: purchase.products[0].id, availableQuantity: 1, unplannedUnitCostPen: 0 }] },
    ]) {
      await command(`${receiptPath}/review`, body).expect(400);
    }
    await command(`${receiptPath}/review`, {
      items: [{ supplierOrderProductId: purchase.products[0].id, availableQuantity: 3 }],
    }).expect(409);
    for (const action of [`${receiptPath}/post-to-inventory`, `${path}/calculate-costs`, `${path}/close-receiving`]) {
      await command(action, { unitCostPen: 1, createdBy: userId }).expect(400);
    }
    await command(`${path}/issues`, { type: 'SHORTAGE', quantity: 1, description: 'Falta' }).expect(400);
    await command(`${path}/issues/${randomUUID()}/close`, { resolutionNote: ' ' }).expect(400);
    const detail = await request(app).get(receiptPath).set('Cookie', cookie).expect(200);
    expect(detail.body).toMatchObject({ reviewStatus: 'PENDING', inventoryPosted: false, items: [] });
    await request(app).post('/api/supplier-orders').set('Cookie', cookie).expect(400);
    await request(app).patch(path).set('Cookie', cookie).send({}).expect(400);
  });

  it('valida identificadores y pertenencia de paquetes e incidencias', async () => {
    const purchase = await createPurchase();
    const other = await createPurchase();
    const path = basePath(purchase.id);
    const otherPath = basePath(other.id);
    const receipt = await command(`${path}/receipts`).expect(201);
    const foreignPath = `${otherPath}/receipts/${receipt.body.id}`;
    await request(app).get(foreignPath).set('Cookie', cookie).expect(404);
    await command(`${otherPath}/receipts`).expect(201);
    await command(`${foreignPath}/review`, {
      items: [{ supplierOrderProductId: other.products[0].id, availableQuantity: 1 }],
    }).expect(404);
    await command(`${foreignPath}/post-to-inventory`).expect(404);
    await command(`${path}/issues/${randomUUID()}/close`, { resolutionNote: 'Crédito' }).expect(404);
    await command(`${path}/receipts/bad-id/review`, { items: [] }).expect(400);
    await request(app).get('/api/supplier-orders/bad-id/issues').set('Cookie', cookie).expect(400);
    await command(`${basePath(randomUUID())}/calculate-costs`).expect(404);
  });

  it('protege todas las nuevas rutas por autenticación y rol', async () => {
    const path = basePath(randomUUID());
    const receiptPath = `${path}/receipts/${randomUUID()}`;
    const deniedCookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'customer' })}`;
    const routes: ['get' | 'post', string][] = [
      ['get', `${path}/receipts`],
      ['get', receiptPath],
      ['post', `${path}/receipts`],
      ['post', `${receiptPath}/review`],
      ['post', `${receiptPath}/post-to-inventory`],
      ['post', `${path}/close-receiving`],
      ['post', `${path}/calculate-costs`],
      ['get', `${path}/issues`],
      ['post', `${path}/issues`],
      ['post', `${path}/issues/${randomUUID()}/close`],
    ];
    for (const [method, url] of routes) {
      await request(app)[method](url).expect(401);
      await request(app)[method](url).set('Cookie', deniedCookie).expect(403);
    }
  });
});
