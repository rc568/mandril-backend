import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routerApp } from '@/app/router';
import {
  billingOrdersTable,
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  salesChannelTable,
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
let variantId: number;

beforeAll(resetTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Billing', lastName: 'Document', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  cookie = `accessToken=${await Jwt.generateAccessToken({ id: userId, userName: tag, role: 'employee' })}`;

  const [channel] = await db
    .insert(salesChannelTable)
    .values({ channel: tag.slice(0, 25), createdBy: userId })
    .returning();
  salesChannelId = channel.id;

  const [product] = await db
    .insert(productTable)
    .values({ name: `${tag} product`, slug: `${tag}-product`, createdBy: userId })
    .returning();
  const [variant] = await db
    .insert(productVariantTable)
    .values({
      productId: product.id,
      code: tag.slice(0, 5),
      price: '100.000000',
      purchasePrice: '60.000000',
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;

  await db.insert(inventoryBalanceTable).values({
    productVariantId: variantId,
    bucket: 'AVAILABLE',
    quantity: 2,
    updatedBy: userId,
  });
});

const postOrder = (path: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/orders${path}`).set('Cookie', cookie).send(body);

const createCompletedOrder = async () => {
  const order = await postOrder('', {
    type: 'SALE',
    salesChannelId,
    client: { contactName: 'Cliente de billing' },
    products: [{ variantId, type: 'SALE', quantity: 1, price: 100 }],
  }).expect(201);
  await postOrder(`/${order.body.id as string}/complete`).expect(200);
  return order.body.id as string;
};

const createPendingBilling = async (orderId: string) => {
  const response = await request(app)
    .post(`/api/orders/${orderId}/billing`)
    .set('Cookie', cookie)
    .send({
      status: 'PENDING',
      amount: 100,
      billingName: 'Cliente de prueba',
      billingReceiptType: 'BOLETA',
      billingDocumentNumberType: 'DNI',
      billingDocumentNumber: '12345678',
    })
    .expect(201);
  return response.body.id as string;
};

describe('actualización del documento de billing', () => {
  it('borra el número guardado al pasar a SIN DOCUMENTO y rechaza volver a enviar uno', async () => {
    const orderId = await createCompletedOrder();
    const billingId = await createPendingBilling(orderId);

    const update = {
      billingName: 'Cliente de prueba',
      billingReceiptType: 'BOLETA',
      billingDocumentNumberType: 'SIN DOCUMENTO',
    };
    const updatedBilling = await request(app)
      .patch(`/api/billing/${billingId}`)
      .set('Cookie', cookie)
      .send(update)
      .expect(200);

    expect(updatedBilling.body).toMatchObject({
      billingDocumentNumberType: 'SIN DOCUMENTO',
      billingDocumentNumber: null,
    });

    await request(app)
      .patch(`/api/billing/${billingId}`)
      .set('Cookie', cookie)
      .send({ ...update, billingDocumentNumber: '12345678' })
      .expect(400);
  });

  it('elimina físicamente solo los pendientes y conserva los comprobantes con código', async () => {
    const orderId = await createCompletedOrder();
    const pendingBillingId = await createPendingBilling(orderId);

    await request(app).delete(`/api/billing/${pendingBillingId}`).set('Cookie', cookie).expect(200);
    expect(await db.select().from(billingOrdersTable).where(eq(billingOrdersTable.id, pendingBillingId))).toHaveLength(
      0,
    );

    const issuedBillingId = await createPendingBilling(orderId);
    const issued = await request(app)
      .patch(`/api/billing/${issuedBillingId}/issue`)
      .set('Cookie', cookie)
      .send({ code: 'EB01-0001' })
      .expect(200);
    expect(issued.body).toMatchObject({ status: 'ISSUED', code: 'EB01-0001' });

    await request(app).delete(`/api/billing/${issuedBillingId}`).set('Cookie', cookie).expect(409);
    expect(await db.select().from(billingOrdersTable).where(eq(billingOrdersTable.id, issuedBillingId))).toHaveLength(
      1,
    );

    await request(app).patch(`/api/billing/${issuedBillingId}/void`).set('Cookie', cookie).expect(200);
    await request(app).delete(`/api/billing/${issuedBillingId}`).set('Cookie', cookie).expect(409);
    const voidedBilling = await db.select().from(billingOrdersTable).where(eq(billingOrdersTable.id, issuedBillingId));
    expect(voidedBilling).toHaveLength(1);
    expect(voidedBilling[0]).toMatchObject({ status: 'VOIDED', code: 'EB01-0001', deletedAt: null });
  });
});
