import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupplierOrderService } from '@/modules/supplier-order';
import { createSupplierOrderSchema } from '@/modules/supplier-order/schemas/supplier-order.schema';
import {
  db,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderProductTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new SupplierOrderService();
let userId: string;
let supplierId: string;
let productId: number;
let variantId: number;
let tag: string;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({ name: 'Compras', lastName: 'Prueba', userName: tag, email: `${tag}@example.test`, password: 'unused' })
    .returning();
  userId = user.id;
  const [supplier] = await db
    .insert(supplierTable)
    .values({ name: `Proveedor ${tag}`, createdBy: userId })
    .returning();
  supplierId = supplier.id;
  const [product] = await db
    .insert(productTable)
    .values({ name: `Cámara ${tag}`, slug: tag, createdBy: userId })
    .returning();
  productId = product.id;
  const [variant] = await db
    .insert(productVariantTable)
    .values({
      productId,
      code: String(++code).padStart(5, '0'),
      price: '100.000000',
      purchasePrice: '60.000000',
      quantityInStock: 7,
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;
});

const input = () => ({
  supplierId,
  currency: 'USD',
  supplierPaymentAmount: 250,
  trackingNumber: `DHL-${tag}`,
  products: [{ productVariantId: variantId, type: 'PURCHASE', quantityOrdered: 10, unitPrice: 21.25 }],
});
const create = (changes: Record<string, unknown> = {}) =>
  service.create(createSupplierOrderSchema.parse({ ...input(), ...changes }), userId);

describe('creación de compras', () => {
  it('registra cabecera y líneas con auditoría, sin cambiar existencias ni costos de Product', async () => {
    const purchase = await create();
    expect(purchase).toMatchObject({
      supplierId,
      currency: 'USD',
      status: 'PREPARING',
      reviewStatus: 'PENDING',
      recordOrigin: 'SYSTEM',
      costCalculationVersion: 'LEGACY_V1',
      supplierPaymentAmount: '250.000000',
      createdBy: userId,
      expenses: [],
    });
    expect(purchase.products).toHaveLength(1);
    expect(purchase.products[0]).toMatchObject({
      supplierOrderId: purchase.id,
      productVariantId: variantId,
      unitPrice: '21.250000',
      subtotalPrice: '212.500000',
      calculatedUnitCost: null,
      calculatedUnitCostPen: null,
      createdBy: userId,
    });
    expect(purchase.products[0].id).toBeTruthy();
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ quantityInStock: 7, purchasePrice: '60.000000' });
    expect(await db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, purchase.id))).toEqual(
      [],
    );
  });

  it('conserva líneas compradas y compensatorias de la misma variante', async () => {
    const purchase = await create({
      products: [
        ...input().products,
        { productVariantId: variantId, type: 'COMPENSATION', quantityOrdered: 2, unitPrice: 0 },
      ],
    });
    expect(purchase.products).toHaveLength(2);
    expect(new Set(purchase.products.map((p) => p.id)).size).toBe(2);
    expect(purchase.products.find((p) => p.type === 'COMPENSATION')).toMatchObject({
      subtotalPrice: '0.000000',
      calculatedUnitCostPen: null,
    });
  });

  it('crea un envío exclusivamente compensatorio sin pago por productos', async () => {
    const purchase = await create({
      type: 'COMPENSATION',
      supplierPaymentAmount: 0,
      products: [{ productVariantId: variantId, type: 'COMPENSATION', quantityOrdered: 2, unitPrice: 0 }],
    });
    expect(purchase).toMatchObject({ type: 'COMPENSATION', supplierPaymentAmount: '0.000000', status: 'PREPARING' });
  });

  it('rechaza proveedores inexistentes o inactivos', async () => {
    await expect(create({ supplierId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await db.update(supplierTable).set({ isActive: false }).where(eq(supplierTable.id, supplierId));
    await expect(create()).rejects.toMatchObject({
      statusCode: 409,
      message: errorMessages.supplierOrder.inactiveSupplier,
    });
    expect((await service.getAll({ supplierId })).orders).toEqual([]);
  });

  it.each(['missing', 'deletedVariant', 'deletedProduct'] as const)(
    'rechaza referencias no disponibles: %s',
    async (reason) => {
      if (reason === 'deletedVariant')
        await db
          .update(productVariantTable)
          .set({ deletedAt: new Date() })
          .where(eq(productVariantTable.id, variantId));
      if (reason === 'deletedProduct')
        await db.update(productTable).set({ deletedAt: new Date() }).where(eq(productTable.id, productId));
      const products = input().products.map((p) => ({
        ...p,
        productVariantId: reason === 'missing' ? 32767 : variantId,
      }));
      await expect(create({ products })).rejects.toMatchObject({
        statusCode: 404,
        message: errorMessages.supplierOrder.variantUnavailable,
      });
      expect((await service.getAll({ supplierId })).orders).toEqual([]);
    },
  );

  it('permite abastecer productos inactivos para venta que no están eliminados', async () => {
    await db.update(productTable).set({ isActive: false }).where(eq(productTable.id, productId));
    await db.update(productVariantTable).set({ isActive: false }).where(eq(productVariantTable.id, variantId));
    expect((await create()).products[0].productVariant.isActive).toBe(false);
  });

  it('revierte la cabecera si falla la inserción de una línea en PostgreSQL', async () => {
    const dto = createSupplierOrderSchema.parse(input());
    // Simulate a downstream storage failure after the header has already been inserted.
    dto.products[0].unitPrice = '1000000.000000';
    await expect(service.create(dto, userId)).rejects.toThrow();
    expect((await service.getAll({ supplierId })).orders).toEqual([]);
    expect(
      await db.select().from(supplierOrderProductTable).where(eq(supplierOrderProductTable.createdBy, userId)),
    ).toEqual([]);
  });
});

describe('consultas de compras', () => {
  it('consulta relaciones y conserva el historial de proveedores y variantes desactivados o eliminados', async () => {
    const purchase = await create();
    await db.update(supplierTable).set({ isActive: false }).where(eq(supplierTable.id, supplierId));
    await db.update(productVariantTable).set({ deletedAt: new Date() }).where(eq(productVariantTable.id, variantId));
    const detail = await service.getById(purchase.id);
    expect(detail.supplier).toMatchObject({ id: supplierId, isActive: false });
    expect(detail.products[0].productVariant.productParent).toMatchObject({ id: productId, name: `Cámara ${tag}` });
    expect(detail.products[0].productVariant.deletedAt).not.toBeNull();
    expect((await service.getAll({ supplierId })).pagination.totalItems).toBe(1);
    await expect(service.getById(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it('combina filtros sin multiplicar resultados por la cantidad de líneas', async () => {
    const purchase = await create({ products: [...input().products, ...input().products] });
    await create({ currency: 'PEN' });
    const result = await service.getAll({
      supplierId,
      currency: 'USD',
      type: 'PURCHASE',
      status: 'PREPARING',
      reviewStatus: 'PENDING',
    });
    expect(result.orders.map((o) => o.id)).toEqual([purchase.id]);
    expect(result.pagination.totalItems).toBe(1);
    expect((await service.getAll({ supplierId, status: 'RECEIVED' })).orders).toEqual([]);
  });

  it.each(['trackingNumber', 'importPolicy', 'observation'] as const)('busca texto literal en %s', async (field) => {
    const purchase = await create({ [field]: `ABC%_${tag}` });
    await create({ [field]: `ABCXX${tag}` });
    expect((await service.getAll({ supplierId, search: `abc%_${tag}` })).orders.map((o) => o.id)).toEqual([
      purchase.id,
    ]);
  });

  it('busca por nombre del proveedor y pagina con fechas empatadas', async () => {
    const createdAt = new Date('2026-01-01T12:00:00Z');
    const headers = await db
      .insert(supplierOrderTable)
      .values(Array.from({ length: 25 }, () => ({ supplierId, createdBy: userId, createdAt })))
      .returning({ id: supplierOrderTable.id });
    const first = await service.getAll({ search: `PROVEEDOR ${tag}`, limit: 24, page: 1 });
    const second = await service.getAll({ search: tag, limit: 24, page: 2 });
    expect(first.orders).toHaveLength(24);
    expect(second.orders).toHaveLength(1);
    expect(first.pagination).toMatchObject({ totalItems: 25, nextPage: 2 });
    expect([...first.orders, ...second.orders].map((o) => o.id)).toEqual(
      headers
        .map((o) => o.id)
        .sort()
        .reverse(),
    );
    expect((await service.getAll({ supplierId, page: 3, limit: 24 })).orders).toEqual([]);
    expect((await service.getAll({ supplierId, page: -1, limit: 999 })).pagination).toMatchObject({
      page: 1,
      pageSize: 48,
    });
  });

  it('conserva los importes desconocidos de un registro histórico', async () => {
    const [legacy] = await db
      .insert(supplierOrderTable)
      .values({
        supplierId,
        createdBy: userId,
        recordOrigin: 'LEGACY_IMPORT',
        status: 'RECEIVED',
        reviewStatus: null,
        arrivalDateLegacy: '2021-03-04',
      })
      .returning();
    const detail = await service.getById(legacy.id);
    expect(detail).toMatchObject({
      currency: null,
      supplierPaymentAmount: null,
      reviewStatus: null,
      arrivalDateLegacy: '2021-03-04',
      products: [],
      expenses: [],
    });
  });
});
