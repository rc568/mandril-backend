import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INVENTORY_BUCKET } from '@/modules/inventory/domain/constants';
import { db, inventoryBalanceTable, productTable, productVariantTable, userTable } from '@/shared/db';
import { assertTestDatabase } from '../support/database';
import { resetSupplierTestSchema } from './database';

let userId: string;
let editorId: string;
let variantId: number;
let otherVariantId: number;
let code = 0;

beforeAll(resetSupplierTestSchema);
beforeEach(async () => {
  await assertTestDatabase();
  const tag = randomUUID();
  const users = await db
    .insert(userTable)
    .values(
      ['creator', 'editor'].map((role) => ({
        name: role,
        lastName: 'Inventory test',
        userName: role + tag,
        email: `${role + tag}@example.test`,
        password: 'unused',
      })),
    )
    .returning();
  userId = users[0].id;
  editorId = users[1].id;
  const [product] = await db.insert(productTable).values({ name: tag, slug: tag, createdBy: userId }).returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      [0, 1].map(() => ({
        productId: product.id,
        code: String(++code).padStart(5, '0'),
        price: '100.000000',
        purchasePrice: '60.000000',
        quantityInStock: 7,
        createdBy: userId,
      })),
    )
    .returning();
  variantId = variants[0].id;
  otherVariantId = variants[1].id;
});

const available = () =>
  and(eq(inventoryBalanceTable.productVariantId, variantId), eq(inventoryBalanceTable.bucket, 'AVAILABLE'));
const insert = (changes: Partial<typeof inventoryBalanceTable.$inferInsert> = {}) =>
  db
    .insert(inventoryBalanceTable)
    .values({
      productVariantId: variantId,
      bucket: 'AVAILABLE',
      quantity: 5,
      updatedBy: userId,
      ...changes,
    })
    .returning();

describe('saldos por variante y condición', () => {
  it('permite una fila por condición y mantiene separadas las variantes', async () => {
    await db.insert(inventoryBalanceTable).values(
      INVENTORY_BUCKET.map((bucket) => ({
        productVariantId: variantId,
        bucket,
        quantity: 1,
        updatedBy: userId,
      })),
    );
    await insert({ productVariantId: otherVariantId });
    expect(
      await db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variantId)),
    ).toHaveLength(4);
    await expect(insert()).rejects.toMatchObject({ cause: { code: '23505', constraint: 'inventory_balance_pk' } });
  });

  it('admite un saldo cero y registra usuario y fecha desde la creación', async () => {
    const [balance] = await db
      .insert(inventoryBalanceTable)
      .values({
        productVariantId: variantId,
        bucket: 'AVAILABLE',
        updatedBy: userId,
      })
      .returning();
    expect(balance).toMatchObject({ quantity: 0, updatedBy: userId });
    expect(balance.updatedAt).toBeInstanceOf(Date);
  });

  it('rechaza cantidades negativas tanto al insertar como al descontar', async () => {
    await expect(insert({ quantity: -1 })).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'inventory_balance_quantity_check' },
    });
    await insert();
    await expect(
      db
        .update(inventoryBalanceTable)
        .set({ quantity: sql`${inventoryBalanceTable.quantity} - 6`, updatedBy: editorId })
        .where(available()),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    expect((await db.select().from(inventoryBalanceTable).where(available()))[0]).toMatchObject({
      quantity: 5,
      updatedBy: userId,
    });
  });

  it('actualiza la fecha de auditoría junto con el saldo', async () => {
    await insert({ updatedAt: new Date('2021-01-01T00:00:00Z') });
    const [balance] = await db
      .update(inventoryBalanceTable)
      .set({ quantity: 3, updatedBy: editorId })
      .where(available())
      .returning();
    expect(balance).toMatchObject({ quantity: 3, updatedBy: editorId });
    expect(balance.updatedAt.getTime()).toBeGreaterThan(new Date('2021-01-01T00:00:00Z').getTime());
  });

  it('exige variante y usuario existentes y no permite perder esas referencias', async () => {
    await expect(insert({ productVariantId: 32767 })).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(insert({ updatedBy: randomUUID() })).rejects.toMatchObject({ cause: { code: '23503' } });
    await insert();
    await expect(db.delete(productVariantTable).where(eq(productVariantTable.id, variantId))).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });

  it('revierte todas las modificaciones si un saldo de la transacción resulta negativo', async () => {
    await insert();
    await insert({ bucket: 'RESERVED', quantity: 2 });
    await expect(
      db.transaction(async (tx) => {
        await tx.update(inventoryBalanceTable).set({ quantity: 4, updatedBy: editorId }).where(available());
        await tx
          .update(inventoryBalanceTable)
          .set({ quantity: -1, updatedBy: editorId })
          .where(
            and(eq(inventoryBalanceTable.productVariantId, variantId), eq(inventoryBalanceTable.bucket, 'RESERVED')),
          );
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    const balances = await db
      .select()
      .from(inventoryBalanceTable)
      .where(eq(inventoryBalanceTable.productVariantId, variantId));
    expect(balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'AVAILABLE', quantity: 5, updatedBy: userId }),
        expect.objectContaining({ bucket: 'RESERVED', quantity: 2, updatedBy: userId }),
      ]),
    );
  });

  it('no modifica automáticamente el stock ni el costo actuales de la variante', async () => {
    await insert({ quantity: 20 });
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) }),
    ).toMatchObject({ quantityInStock: 7, purchasePrice: '60.000000' });
  });
});
