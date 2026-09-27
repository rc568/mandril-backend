import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SupplierOrderExpenseService,
  SupplierOrderReceiptService,
  SupplierOrderService,
} from '@/modules/supplier-order';
import { createSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';
import {
  db,
  inventoryBalanceTable,
  stockMovementTable,
  supplierOrderExpenseTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new SupplierOrderReceiptService();
let orderId: string;
let userId: string;
beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Recepción',
      lastName: 'Prueba',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  const [order] = await db
    .insert(supplierOrderTable)
    .values({
      supplierId: supplier.id,
      currency: 'USD',
      supplierPaymentAmount: '100.000000',
      createdBy: userId,
    })
    .returning();
  orderId = order.id;
});
const create = () => service.create(orderId, createSupplierOrderReceiptSchema.parse({}), userId);
const order = () => db.query.supplierOrderTable.findFirst({ where: eq(supplierOrderTable.id, orderId) });

describe('llegada y cierre de recepción', () => {
  it('registra llegada y auditoría sin costo proyectado ni ingreso de inventario', async () => {
    const receipt = await create();
    expect(receipt).toMatchObject({
      sequenceNumber: 1,
      reviewStatus: 'PENDING',
      receivedBy: userId,
      createdBy: userId,
      reviewedAt: null,
    });
    expect(receipt.receivedAt).toBeInstanceOf(Date);
    expect(await order()).toMatchObject({
      status: 'PARTIALLY_RECEIVED',
      projectedExchangeRate: null,
      reviewStatus: 'PENDING',
    });
    expect(await db.select().from(stockMovementTable).where(eq(stockMovementTable.purchaseId, orderId))).toEqual([]);
    expect(await db.select().from(inventoryBalanceTable)).toEqual([]);
  });

  it('permite registrar desde tránsito y conserva fechas de llegada independientes', async () => {
    await new SupplierOrderService().markInTransit(orderId, userId);
    await service.create(
      orderId,
      createSupplierOrderReceiptSchema.parse({
        receivedAt: '2026-09-20T10:00:00-05:00',
        observation: 'Segundo paquete',
      }),
      userId,
    );
    await service.create(
      orderId,
      createSupplierOrderReceiptSchema.parse({
        receivedAt: '2026-09-19T15:00:00Z',
      }),
      userId,
    );
    const receipts = await service.getAll(orderId);
    expect(receipts.map((receipt) => receipt.sequenceNumber)).toEqual([1, 2]);
    expect(receipts[0].receivedAt.toISOString()).toBe('2026-09-20T15:00:00.000Z');
  });

  it('la primera llegada bloquea edición, gastos y cancelación', async () => {
    const expenses = new SupplierOrderExpenseService();
    const expense = await expenses.create(
      orderId,
      { type: 'LOCAL_FREIGHT', amountUsd: '10.000000', includedInSupplierPayment: false },
      userId,
    );
    await create();
    const purchases = new SupplierOrderService();
    await expect(purchases.update(orderId, { supplierPaymentAmount: '90.000000' }, userId)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(purchases.cancel(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(expenses.update(orderId, expense.id, { amountUsd: '20.000000' }, userId)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(expenses.delete(orderId, expense.id, userId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rechaza gastos sin equivalente en la moneda de compra antes de bloquearlos', async () => {
    const [expense] = await db
      .insert(supplierOrderExpenseTable)
      .values({
        supplierOrderId: orderId,
        type: 'LOCAL_FREIGHT',
        amountPen: '30.000000',
        createdBy: userId,
      })
      .returning();
    await expect(create()).rejects.toMatchObject({
      message: errorMessages.supplierOrder.receiptExpenseCurrencyRequired,
    });
    expect((await order())?.status).toBe('PREPARING');
    expect(await service.getAll(orderId)).toEqual([]);
    await new SupplierOrderExpenseService().update(orderId, expense.id, { amountUsd: '8.000000' }, userId);
    await create();
  });

  it('asigna consecutivos sin huecos ni duplicados ante solicitudes simultáneas', async () => {
    await Promise.all([create(), create(), create()]);
    expect((await service.getAll(orderId)).map((receipt) => receipt.sequenceNumber)).toEqual([1, 2, 3]);
    expect((await create()).sequenceNumber).toBe(4);
  });

  it('cada compra comienza su propio consecutivo en uno', async () => {
    await create();
    await create();
    const original = await order();
    if (!original) throw new Error('Missing test order');
    const [other] = await db
      .insert(supplierOrderTable)
      .values({
        supplierId: original.supplierId,
        currency: 'USD',
        supplierPaymentAmount: '100.000000',
        createdBy: userId,
      })
      .returning();
    expect((await service.create(other.id, {}, userId)).sequenceNumber).toBe(1);
  });

  it('cierra la llegada sin completar revisiones y registra usuario y fecha del cierre', async () => {
    await create();
    const before = Date.now();
    const closed = await service.closeReceiving(orderId, userId);
    expect(closed).toMatchObject({ status: 'RECEIVED', reviewStatus: 'PENDING', receivingClosedBy: userId });
    expect(closed.receivingClosedAt?.getTime()).toBeGreaterThanOrEqual(before);
    await expect(create()).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.closeReceiving(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('calcula el estado agregado de revisión al cerrar', async () => {
    const first = await create();
    await create();
    await db
      .update(supplierOrderReceiptTable)
      .set({ reviewStatus: 'COMPLETED', reviewedAt: new Date(), reviewedBy: userId })
      .where(eq(supplierOrderReceiptTable.id, first.id));
    expect(await service.closeReceiving(orderId, userId)).toMatchObject({ reviewStatus: 'IN_PROGRESS' });
  });

  it('si llega otro paquete después de revisar los anteriores vuelve a IN_PROGRESS', async () => {
    await create();
    await db.update(supplierOrderTable).set({ reviewStatus: 'COMPLETED' }).where(eq(supplierOrderTable.id, orderId));
    await create();
    expect((await order())?.reviewStatus).toBe('IN_PROGRESS');
  });

  it('puede cerrar con todas las revisiones completadas', async () => {
    await create();
    await db
      .update(supplierOrderReceiptTable)
      .set({ reviewStatus: 'COMPLETED', reviewedAt: new Date(), reviewedBy: userId })
      .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId));
    expect(await service.closeReceiving(orderId, userId)).toMatchObject({ reviewStatus: 'COMPLETED' });
  });

  it.each(['CANCELLED', 'RECEIVED'] as const)('rechaza llegadas en %s', async (status) => {
    await db.update(supplierOrderTable).set({ status }).where(eq(supplierOrderTable.id, orderId));
    await expect(create()).rejects.toMatchObject({ statusCode: 409 });
  });

  it('no fabrica recepciones históricas y no cierra compras sin paquetes', async () => {
    await expect(service.closeReceiving(orderId, userId)).rejects.toMatchObject({ statusCode: 409 });
    await db
      .update(supplierOrderTable)
      .set({ recordOrigin: 'LEGACY_IMPORT' })
      .where(eq(supplierOrderTable.id, orderId));
    await expect(create()).rejects.toMatchObject({ statusCode: 409 });
  });

  it('revierte llegada y estado si falla la auditoría', async () => {
    await expect(service.create(orderId, {}, randomUUID())).rejects.toThrow();
    expect(await service.getAll(orderId)).toEqual([]);
    expect((await order())?.status).toBe('PREPARING');
    expect((await create()).sequenceNumber).toBe(1);
  });

  it('devuelve 404 para una compra inexistente', async () => {
    await expect(service.getAll(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.create(randomUUID(), {}, userId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.closeReceiving(randomUUID(), userId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
