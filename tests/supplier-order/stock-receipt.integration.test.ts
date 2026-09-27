import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  supplierTable,
  userTable,
} from '@/shared/db';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

let userId: string;
let purchaseId: string;
let receiptItemId: string;
let variantId: number;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Inventory',
      lastName: 'Test',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  userId = user.id;
  const [supplier] = await db.insert(supplierTable).values({ name: tag, createdBy: userId }).returning();
  const [purchase] = await db
    .insert(supplierOrderTable)
    .values({ supplierId: supplier.id, createdBy: userId })
    .returning();
  purchaseId = purchase.id;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const [variant] = await db
    .insert(productVariantTable)
    .values({
      productId: product.id,
      code: String(++code).padStart(5, '0'),
      price: '100.000000',
      purchasePrice: '60.000000',
      quantityInStock: 0,
      createdBy: userId,
    })
    .returning();
  variantId = variant.id;
  const [receipt] = await db
    .insert(supplierOrderReceiptTable)
    .values({
      supplierOrderId: purchaseId,
      sequenceNumber: 1,
      receivedAt: new Date(),
      receivedBy: userId,
      reviewStatus: 'COMPLETED',
      reviewedAt: new Date(),
      reviewedBy: userId,
      createdBy: userId,
    })
    .returning();
  const [item] = await db
    .insert(supplierOrderReceiptItemTable)
    .values({
      receiptId: receipt.id,
      productVariantId: variantId,
      availableQuantity: 8,
      defectiveQuantity: 2,
      unplannedUnitCostPen: '0.000000',
    })
    .returning();
  receiptItemId = item.id;
});

const movement = (): typeof stockMovementTable.$inferInsert => ({
  productVariantId: variantId,
  type: 'PURCHASE',
  quantity: 8,
  purchaseId,
  supplierOrderReceiptItemId: receiptItemId,
  toBucket: 'AVAILABLE',
  unitCostPen: '162.569262',
  createdBy: userId,
});
const insert = (changes: Partial<typeof stockMovementTable.$inferInsert> = {}) =>
  db
    .insert(stockMovementTable)
    .values({ ...movement(), ...changes })
    .returning();

describe('restricciones de ingreso por detalle de recepción', () => {
  it('registra buenas y defectuosas por separado conservando el costo final', async () => {
    const [available] = await insert();
    const [defective] = await insert({ toBucket: 'DEFECTIVE', quantity: 2 });
    expect(available).toMatchObject({
      supplierOrderReceiptItemId: receiptItemId,
      toBucket: 'AVAILABLE',
      unitCostPen: '162.569262',
    });
    expect(defective).toMatchObject({ toBucket: 'DEFECTIVE', quantity: 2, unitCostPen: '162.569262' });
  });

  it('impide ingresos duplicados para el mismo detalle y destino', async () => {
    await insert();
    await expect(insert()).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'stock_movement_receipt_item_bucket_idx' },
    });
  });

  it('permite el mismo destino para detalles diferentes', async () => {
    await insert();
    const item = await db.query.supplierOrderReceiptItemTable.findFirst({
      where: eq(supplierOrderReceiptItemTable.id, receiptItemId),
    });
    if (!item) throw new Error('Missing receipt item');
    const [other] = await db
      .insert(supplierOrderReceiptItemTable)
      .values({
        receiptId: item.receiptId,
        productVariantId: variantId,
        availableQuantity: 1,
        unplannedUnitCostPen: '0.000000',
      })
      .returning();
    expect(await insert({ supplierOrderReceiptItemId: other.id, quantity: 1 })).toHaveLength(1);
  });

  it.each([
    { unitCostPen: null },
    { quantity: 0 },
    { quantity: -1 },
    { toBucket: null },
    { toBucket: 'QUARANTINE' as const },
    { toBucket: 'RESERVED' as const },
    { type: 'RETURN' as const },
    { purchaseId: null },
    { deletedAt: new Date() },
  ])('rechaza un ingreso incompleto o inválido: %j', async (changes) => {
    await expect(insert(changes)).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'stock_movement_receipt_entry_check' },
    });
  });

  it('permite costo cero pero rechaza costos negativos', async () => {
    expect((await insert({ unitCostPen: '0.000000' }))[0].unitCostPen).toBe('0.000000');
    await expect(insert({ toBucket: 'DEFECTIVE', unitCostPen: '-0.000001' })).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'stock_movement_unit_cost_check' },
    });
  });

  it('rechaza referencias inexistentes y conserva la referencia del movimiento', async () => {
    await expect(insert({ supplierOrderReceiptItemId: randomUUID() })).rejects.toMatchObject({
      cause: { code: '23503' },
    });
    await insert();
    await expect(
      db.delete(supplierOrderReceiptItemTable).where(eq(supplierOrderReceiptItemTable.id, receiptItemId)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('no permite ocultar un ingreso con soft delete para repetirlo', async () => {
    const [entry] = await insert();
    await expect(
      db
        .update(stockMovementTable)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(stockMovementTable.id, entry.id)),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(insert()).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('mantiene compatibles las inserciones de ventas y compras históricas sin detalle', async () => {
    const rows = await db
      .insert(stockMovementTable)
      .values([
        { productVariantId: variantId, type: 'SALE', quantity: 1, createdBy: userId },
        { productVariantId: variantId, type: 'PURCHASE', purchaseId, quantity: 1, createdBy: userId },
        { productVariantId: variantId, type: 'PURCHASE', purchaseId, quantity: 1, createdBy: userId },
      ])
      .returning();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.supplierOrderReceiptItemId === null && row.unitCostPen === null)).toBe(true);
  });

  it('revierte el paquete completo cuando un movimiento posterior está duplicado', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(stockMovementTable).values(movement());
        await tx.insert(stockMovementTable).values({ ...movement(), toBucket: 'DEFECTIVE', quantity: 2 });
        await tx.insert(stockMovementTable).values(movement());
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(
      await db
        .select()
        .from(stockMovementTable)
        .where(eq(stockMovementTable.supplierOrderReceiptItemId, receiptItemId)),
    ).toEqual([]);
  });
});
