import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createSupplierOrderSchema,
  updateSupplierOrderSchema,
} from '@/modules/supplier-order/schemas/supplier-order.schema';
import { SupplierOrderService } from '@/modules/supplier-order/supplier-order.service';
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

describe('edición y estados de compras', () => {
  it('conserva los IDs existentes, elimina líneas omitidas y agrega compensaciones', async () => {
    const purchase = await create({ products: [...input().products, ...input().products] });
    const retained = purchase.products[0];
    const result = await service.update(
      purchase.id,
      updateSupplierOrderSchema.parse({
        observation: 'Compra corregida',
        products: [
          { ...input().products[0], id: retained.id, quantityOrdered: 3, unitPrice: 12 },
          { productVariantId: variantId, type: 'COMPENSATION', quantityOrdered: 1, unitPrice: 0 },
        ],
      }),
      userId,
    );
    expect(result.products).toHaveLength(2);
    expect(result.products.find((p) => p.id === retained.id)).toMatchObject({
      quantityOrdered: 3,
      subtotalPrice: '36.000000',
      createdBy: retained.createdBy,
      updatedBy: userId,
    });
    expect(result.products.some((p) => p.id === purchase.products[1].id)).toBe(false);
    expect(result.products.find((p) => p.type === 'COMPENSATION')).toMatchObject({ createdBy: userId });
    expect(result).toMatchObject({ observation: 'Compra corregida', updatedBy: userId });
  });

  it('permite editar en tránsito y no altera las líneas al editar solo la cabecera', async () => {
    const purchase = await create({ trackingNumber: null });
    expect(await service.markInTransit(purchase.id, userId)).toMatchObject({ status: 'IN_TRANSIT', updatedBy: userId });
    const result = await service.update(
      purchase.id,
      updateSupplierOrderSchema.parse({ observation: 'En camino' }),
      userId,
    );
    expect(result.products).toEqual(purchase.products);
    expect(result.status).toBe('IN_TRANSIT');
  });

  it.each(['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const)('bloquea la edición en %s', async (status) => {
    const purchase = await create();
    await db.update(supplierOrderTable).set({ status }).where(eq(supplierOrderTable.id, purchase.id));
    await expect(
      service.update(purchase.id, updateSupplierOrderSchema.parse({ observation: 'Cambio' }), userId),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.getById(purchase.id)).observation).toBeNull();
  });

  it('rechaza IDs ajenos sin modificar ninguna de las compras', async () => {
    const purchase = await create();
    const other = await create();
    await expect(
      service.update(
        purchase.id,
        updateSupplierOrderSchema.parse({
          products: [{ ...input().products[0], id: other.products[0].id }],
        }),
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: errorMessages.supplierOrder.productNotInOrder });
    expect(await service.getById(purchase.id)).toEqual(purchase);
    expect(await service.getById(other.id)).toEqual(other);
  });

  it('valida el tipo de compra contra las líneas reemplazadas', async () => {
    const purchase = await create();
    const compensation = [{ productVariantId: variantId, type: 'COMPENSATION', quantityOrdered: 1, unitPrice: 0 }];
    await expect(
      service.update(purchase.id, updateSupplierOrderSchema.parse({ products: compensation }), userId),
    ).rejects.toMatchObject({ message: errorMessages.supplierOrder.purchaseProductRequired });
    const other = await create({ type: 'COMPENSATION', supplierPaymentAmount: 0, products: compensation });
    await expect(
      service.update(other.id, updateSupplierOrderSchema.parse({ products: input().products }), userId),
    ).rejects.toMatchObject({ message: errorMessages.supplierOrder.compensationProductsOnly });
  });

  it('exige importes explícitos al cambiar de moneda', async () => {
    const purchase = await create();
    await expect(
      service.update(purchase.id, updateSupplierOrderSchema.parse({ currency: 'PEN' }), userId),
    ).rejects.toMatchObject({ message: errorMessages.supplierOrder.currencyChangeRequiresAmounts });
    const result = await service.update(
      purchase.id,
      updateSupplierOrderSchema.parse({
        currency: 'PEN',
        supplierPaymentAmount: 800,
        products: [{ ...input().products[0], id: purchase.products[0].id, unitPrice: 70 }],
      }),
      userId,
    );
    expect(result).toMatchObject({ currency: 'PEN', supplierPaymentAmount: '800.000000' });
    expect(result.products[0].unitPrice).toBe('70.000000');
  });

  it('revierte eliminaciones y actualizaciones si una inserción posterior falla', async () => {
    const purchase = await create({ products: [...input().products, ...input().products] });
    const dto = updateSupplierOrderSchema.parse({
      observation: 'No debe persistir',
      products: [{ ...input().products[0], id: purchase.products[0].id, quantityOrdered: 1 }, input().products[0]],
    });
    // Force a database failure after removing and updating existing lines.
    if (!dto.products) throw new Error('Missing test products');
    dto.products[1].unitPrice = '1000000.000000';
    await expect(service.update(purchase.id, dto, userId)).rejects.toThrow();
    expect(await service.getById(purchase.id)).toEqual(purchase);
  });

  it('valida cambios de proveedor y variantes antes de guardar', async () => {
    const purchase = await create();
    await expect(
      service.update(purchase.id, updateSupplierOrderSchema.parse({ supplierId: randomUUID() }), userId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.update(
        purchase.id,
        updateSupplierOrderSchema.parse({
          products: [{ ...input().products[0], productVariantId: 32767 }],
        }),
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await service.getById(purchase.id)).toEqual(purchase);
  });

  it('cancela únicamente desde preparación y conserva sus líneas', async () => {
    const purchase = await create();
    const cancelled = await service.cancel(purchase.id, userId);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', updatedBy: userId });
    expect(cancelled.products).toEqual(purchase.products);
    await expect(service.cancel(purchase.id, userId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.markInTransit(purchase.id, userId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'] as const)(
    'rechaza enviar o cancelar desde %s',
    async (status) => {
      const purchase = await create();
      await db.update(supplierOrderTable).set({ status }).where(eq(supplierOrderTable.id, purchase.id));
      await expect(service.cancel(purchase.id, userId)).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.markInTransit(purchase.id, userId)).rejects.toMatchObject({ statusCode: 409 });
    },
  );

  it('serializa transiciones simultáneas de la misma compra', async () => {
    const purchase = await create();
    const results = await Promise.allSettled([
      service.cancel(purchase.id, userId),
      service.markInTransit(purchase.id, userId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
  });

  it('informa compras inexistentes y rechaza ediciones vacías', async () => {
    await expect(service.update(randomUUID(), { observation: 'Cambio' }, userId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.markInTransit(randomUUID(), userId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.cancel(randomUUID(), userId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.update(randomUUID(), {}, userId)).rejects.toMatchObject({ statusCode: 400 });
  });
});

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
    ).toMatchObject({ purchasePrice: '60.000000' });
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
