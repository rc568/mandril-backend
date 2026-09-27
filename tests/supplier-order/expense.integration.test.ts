import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupplierOrderExpenseService, SupplierOrderService } from '@/modules/supplier-order';
import {
  createSupplierOrderExpenseSchema,
  updateSupplierOrderExpenseSchema,
} from '@/modules/supplier-order/schemas/supplier-order-expense.schema';
import { db, supplierOrderTable, supplierTable, userTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

const service = new SupplierOrderExpenseService();
const orders = new SupplierOrderService();
let userId: string;
let editorId: string;
let orderId: string;
let otherOrderId: string;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const users = await db
    .insert(userTable)
    .values(
      ['creator', 'editor'].map((role) => ({
        name: role,
        lastName: 'Expense test',
        userName: `${role}-${tag}`,
        email: `${role}-${tag}@example.test`,
        password: 'unused',
      })),
    )
    .returning();
  userId = users[0].id;
  editorId = users[1].id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  const purchases = await db
    .insert(supplierOrderTable)
    .values(
      ['USD', 'PEN'].map((currency) => ({
        supplierId: supplier.id,
        currency: currency as 'USD' | 'PEN',
        supplierPaymentAmount: '100.000000',
        createdBy: userId,
      })),
    )
    .returning();
  orderId = purchases[0].id;
  otherOrderId = purchases[1].id;
});

const create = (changes: Record<string, unknown> = {}) =>
  service.create(
    orderId,
    createSupplierOrderExpenseSchema.parse({
      type: 'LOCAL_FREIGHT',
      amountUsd: 44,
      amountPen: 166.32,
      ...changes,
    }),
    userId,
  );

describe('gastos independientes de compras', () => {
  it('conserva ambos importes y su auditoría sin convertirlos ni alterar el pago', async () => {
    const expense = await create({ includedInSupplierPayment: true });
    expect(expense).toMatchObject({
      supplierOrderId: orderId,
      amountUsd: '44.000000',
      amountPen: '166.320000',
      includedInSupplierPayment: true,
      createdBy: userId,
      updatedBy: null,
    });
    const order = await orders.getById(orderId);
    expect(order).toMatchObject({ supplierPaymentAmount: '100.000000', updatedBy: userId });
    expect(order.expenses[0]).toMatchObject({ amountUsd: '44.000000', amountPen: '166.320000' });
  });

  it.each(['amountUsd', 'amountPen'] as const)('permite dejar %s desconocido antes de la recepción', async (field) => {
    expect(await create({ [field]: null })).toMatchObject({ [field]: null });
  });

  it('edita solo lo enviado y distingue null de undefined', async () => {
    const expense = await create({ description: 'Flete', includedInSupplierPayment: true });
    const updated = await service.update(
      orderId,
      expense.id,
      updateSupplierOrderExpenseSchema.parse({
        amountUsd: null,
        amountPen: undefined,
        description: null,
        includedInSupplierPayment: false,
      }),
      editorId,
    );
    expect(updated).toMatchObject({
      amountUsd: null,
      amountPen: '166.320000',
      description: null,
      includedInSupplierPayment: false,
      createdBy: userId,
      createdAt: expense.createdAt,
      updatedBy: editorId,
    });
    expect((await orders.getById(orderId)).updatedBy).toBe(editorId);
  });

  it('impide borrar el único importe al validar el gasto completo', async () => {
    const expense = await create({ amountUsd: null });
    const before = await orders.getById(orderId);
    await expect(
      service.update(orderId, expense.id, updateSupplierOrderExpenseSchema.parse({ amountPen: null }), editorId),
    ).rejects.toMatchObject({ statusCode: 400, message: errorMessages.supplierOrder.expenseAmountRequired });
    expect(await orders.getById(orderId)).toEqual(before);
  });

  it('exige descripción al cambiar a OTHER o limpiar la de un gasto OTHER', async () => {
    const expense = await create();
    await expect(
      service.update(orderId, expense.id, updateSupplierOrderExpenseSchema.parse({ type: 'OTHER' }), editorId),
    ).rejects.toMatchObject({ message: errorMessages.supplierOrder.expenseDescriptionRequired });
    await service.update(
      orderId,
      expense.id,
      updateSupplierOrderExpenseSchema.parse({ type: 'OTHER', description: 'Permiso' }),
      editorId,
    );
    await expect(
      service.update(orderId, expense.id, updateSupplierOrderExpenseSchema.parse({ description: null }), editorId),
    ).rejects.toMatchObject({ message: errorMessages.supplierOrder.expenseDescriptionRequired });
    expect(
      await service.update(
        orderId,
        expense.id,
        updateSupplierOrderExpenseSchema.parse({ type: 'CUSTOMS_TAXES', description: null }),
        editorId,
      ),
    ).toMatchObject({ type: 'CUSTOMS_TAXES', description: null });
  });

  it('rechaza gastos ajenos o inexistentes sin modificar su compra', async () => {
    const expense = await create();
    const before = await orders.getById(orderId);
    for (const id of [expense.id, randomUUID()]) {
      await expect(service.update(otherOrderId, id, { description: 'Cambio' }, editorId)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(service.delete(otherOrderId, id, editorId)).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(await orders.getById(orderId)).toEqual(before);
    expect((await orders.getById(otherOrderId)).updatedBy).toBeNull();
  });

  it('elimina antes de recibir y registra quién modificó la compra', async () => {
    const expense = await create();
    expect((await service.delete(orderId, expense.id, editorId)).id).toBe(expense.id);
    expect(await orders.getById(orderId)).toMatchObject({ expenses: [], updatedBy: editorId });
    await expect(service.delete(orderId, expense.id, editorId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('permite crear, editar y eliminar mientras está en tránsito', async () => {
    await orders.markInTransit(orderId, userId);
    const expense = await create();
    await service.update(orderId, expense.id, { amountPen: '170.000000' }, editorId);
    await service.delete(orderId, expense.id, editorId);
    expect((await orders.getById(orderId)).expenses).toEqual([]);
  });

  it.each(['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const)(
    'bloquea todas las escrituras en %s',
    async (status) => {
      const expense = await create();
      await db.update(supplierOrderTable).set({ status }).where(eq(supplierOrderTable.id, orderId));
      const before = await orders.getById(orderId);
      await expect(create()).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.update(orderId, expense.id, { description: 'Cambio' }, editorId)).rejects.toMatchObject({
        statusCode: 409,
      });
      await expect(service.delete(orderId, expense.id, editorId)).rejects.toMatchObject({ statusCode: 409 });
      expect(await orders.getById(orderId)).toEqual(before);
    },
  );

  it('rechaza compras inexistentes y actualizaciones vacías', async () => {
    const missing = randomUUID();
    await expect(
      service.create(missing, createSupplierOrderExpenseSchema.parse({ type: 'LOCAL_FREIGHT', amountUsd: 1 }), userId),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.update(missing, missing, { description: 'Cambio' }, userId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.delete(missing, missing, userId)).rejects.toMatchObject({ statusCode: 404 });
    const expense = await create();
    await expect(service.update(orderId, expense.id, {}, editorId)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('revierte la eliminación si falla la actualización de auditoría', async () => {
    const expense = await create();
    const before = await orders.getById(orderId);
    // A missing audit user forces a foreign-key failure after deleting the expense.
    await expect(service.delete(orderId, expense.id, randomUUID())).rejects.toThrow();
    expect(await orders.getById(orderId)).toEqual(before);
  });

  it('valida ediciones simultáneas contra el último estado guardado', async () => {
    const expense = await create();
    const results = await Promise.allSettled([
      service.update(orderId, expense.id, { amountUsd: null }, editorId),
      service.update(orderId, expense.id, { amountPen: null }, editorId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 400 } });
    const [saved] = (await orders.getById(orderId)).expenses;
    expect(saved.amountUsd !== null || saved.amountPen !== null).toBe(true);
  });
});
