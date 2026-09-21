import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductRouter } from '@/modules/product';
import { db, productTable, productVariantTable } from '@/shared/db';
import { Jwt } from '@/shared/libs/jwt';
import { errorHandler } from '@/shared/middlewares';
import { sendError, sendSuccess } from '@/shared/utils/api-response';
import { createFixture, type ProductFixture } from './fixtures';

// La única dependencia externa simulada es el bucket. Router, JWT, validación y BD son reales.
vi.mock('@/shared/storage', () => ({
  createObjectStorage: () => ({
    upload: async () => {},
    delete: async () => {},
    getPublicUrl: (key: string) => `https://images.example.test/${key}`,
  }),
}));

const app = express();
app.use(express.json());
app.use(cookieParser());
app.response.sendSuccess = sendSuccess;
app.response.sendError = sendError;
app.use('/products', ProductRouter.create());
app.use(errorHandler);

let fixture: ProductFixture;
let employeeCookie: string;
let adminCookie: string;
beforeEach(async () => {
  fixture = await createFixture();
  employeeCookie = `accessToken=${await Jwt.generateAccessToken({ id: fixture.user.id, userName: fixture.user.userName, role: 'employee' })}`;
  adminCookie = `accessToken=${await Jwt.generateAccessToken({ id: fixture.user.id, userName: fixture.user.userName, role: 'admin' })}`;
});

describe('API de productos', () => {
  it('permite crear, consultar, editar y eliminar según el rol', async () => {
    const created = await request(app).post('/products').set('Cookie', employeeCookie).send(fixture.input).expect(200);
    const id = created.body.id;
    expect(created.body).toMatchObject({ name: fixture.input.name, slug: fixture.input.slug });
    const bySlug = await request(app).get(`/products/${fixture.input.slug}`).expect(200);
    expect(bySlug.body.id).toBe(id);
    const byId = await request(app).get(`/products/${id}`).expect(200);
    expect(byId.body.id).toBe(id);
    const listing = await request(app).get('/products').query({ categoryId: fixture.category.id }).expect(200);
    expect(listing.body.products.map((product: { id: number }) => product.id)).toEqual([id]);

    await request(app)
      .patch(`/products/${id}`)
      .set('Cookie', employeeCookie)
      .send({ name: 'Taladro editado' })
      .expect(200);
    expect((await db.query.productTable.findFirst({ where: eq(productTable.id, id) }))?.name).toBe('Taladro editado');
    await request(app).delete(`/products/${id}`).set('Cookie', employeeCookie).expect(403);
    expect((await db.query.productTable.findFirst({ where: eq(productTable.id, id) }))?.deletedAt).toBeNull();
    await request(app).delete(`/products/${id}`).set('Cookie', adminCookie).expect(200);
    await request(app).get(`/products/${id}`).expect(404);
  });

  it('requiere sesión válida para escribir y buscar variantes', async () => {
    await request(app).post('/products').send(fixture.input).expect(401);
    await request(app).post('/products').set('Cookie', 'accessToken=invalid').send(fixture.input).expect(401);
    await request(app).get('/products/variants/search').expect(401);
    expect(await db.query.productTable.findFirst({ where: eq(productTable.slug, fixture.input.slug) })).toBeUndefined();
  });

  it('devuelve 400 para datos inválidos y 409 para un slug repetido', async () => {
    const invalid = await request(app)
      .post('/products')
      .set('Cookie', employeeCookie)
      .send({ ...fixture.input, variants: [] })
      .expect(400);
    expect(invalid.body.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'variants' })]),
    );
    await request(app).post('/products').set('Cookie', employeeCookie).send(fixture.input).expect(200);
    await request(app).post('/products').set('Cookie', employeeCookie).send(fixture.input).expect(409);
    await request(app).patch('/products/not-an-id').set('Cookie', employeeCookie).send({ name: 'Prueba' }).expect(400);
  });

  it('devuelve variantes al empleado y protege la última de eliminación', async () => {
    const created = await request(app).post('/products').set('Cookie', employeeCookie).send(fixture.input).expect(200);
    const search = await request(app)
      .get('/products/variants/search')
      .set('Cookie', employeeCookie)
      .query({ search: fixture.input.name, limit: '10' })
      .expect(200);
    expect(search.body.products).toHaveLength(1);
    const variantId = search.body.products[0].variantId;
    await request(app)
      .delete(`/products/${created.body.id}/variant/${variantId}`)
      .set('Cookie', adminCookie)
      .expect(409);
  });

  it('elimina una de dos variantes a través del controlador', async () => {
    const created = await request(app)
      .post('/products')
      .set('Cookie', employeeCookie)
      .send(fixture.withAttributes)
      .expect(200);
    const variantId = created.body.productVariant[0].id;
    await request(app)
      .delete(`/products/${created.body.id}/variant/${variantId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ deletedAt: expect.any(Date), deletedBy: fixture.user.id });
  });

  it('recibe multipart, devuelve 201 y permite organizar las imágenes', async () => {
    const created = await request(app).post('/products').set('Cookie', employeeCookie).send(fixture.input).expect(200);
    const url = `/products/${created.body.id}/variants/${created.body.productVariant[0].id}/images`;
    const png = await sharp({ create: { width: 5, height: 5, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
    const uploaded = await request(app)
      .post(url)
      .set('Cookie', employeeCookie)
      .attach('image', png, 'test.png')
      .expect(201);
    expect(uploaded.body).toMatchObject({ position: 1, isPrimary: true });
    const organized = await request(app)
      .patch(url)
      .set('Cookie', employeeCookie)
      .send({ imageIds: [uploaded.body.id], primaryImageId: uploaded.body.id })
      .expect(200);
    expect(organized.body).toEqual([uploaded.body]);
  });

  it('rechaza un multipart sin imagen, con otro campo o con exceso de tamaño', async () => {
    const created = await request(app).post('/products').set('Cookie', employeeCookie).send(fixture.input).expect(200);
    const url = `/products/${created.body.id}/variants/${created.body.productVariant[0].id}/images`;
    await request(app).post(url).set('Cookie', employeeCookie).expect(400);
    await request(app)
      .post(url)
      .set('Cookie', employeeCookie)
      .attach('other', Buffer.from('x'), 'test.png')
      .expect(400);
    await request(app)
      .post(url)
      .set('Cookie', employeeCookie)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.png')
      .expect(413);
  });
});
