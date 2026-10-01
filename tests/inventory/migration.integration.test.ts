import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import { db } from '@/shared/db';
import { assertTestDatabase } from '../support/database';

const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
async function apply(from: number, to = migrations.length) {
  await db.transaction(async (tx) => {
    for (const migration of migrations.slice(from, to)) {
      for (const statement of migration.sql) await tx.execute(sql.raw(statement));
    }
  });
}

beforeEach(async () => {
  await assertTestDatabase();
  await db.execute(sql.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
});

it('applies the complete migration history to an empty database', async () => {
  await apply(0);
  const { rows } = await db.execute(sql`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variant' AND column_name = 'quantity_in_stock'`);
  expect(rows).toHaveLength(0);
  expect((await db.execute(sql`SELECT * FROM inventory_balance`)).rows).toHaveLength(0);
});

it('copies stock, clamps negatives, preserves purchases and creates no movements', async () => {
  const transition = migrations.length - 3;
  await apply(0, transition);
  await db.execute(
    sql.raw(`
    INSERT INTO "user" (id, name, last_name, user_name, email, password)
    VALUES ('11111111-1111-4111-8111-111111111111', 'Migration', 'Test', 'migration', 'migration@example.test', 'unused');
    INSERT INTO product (id, name, slug, created_by)
    VALUES (1, 'Camera', 'camera', '11111111-1111-4111-8111-111111111111');
    INSERT INTO product_variant (id, code, product_id, price, purchase_price, quantity_in_stock, created_by)
    VALUES (1, 'MI001', 1, 100, 60, 12, '11111111-1111-4111-8111-111111111111'),
           (2, 'MI002', 1, 100, 60, -3, '11111111-1111-4111-8111-111111111111'),
           (3, 'MI003', 1, 100, 60, 0, '11111111-1111-4111-8111-111111111111');
    INSERT INTO supplier (id, name) VALUES ('22222222-2222-4222-8222-222222222222', 'Supplier');
    INSERT INTO supplier_order (id, supplier_id, guide, import_policy, status)
    VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'TRACK', 'POLICY', 'Recibido');
    INSERT INTO supplier_order_product (supplier_order_id, product_variant_id, quantity, purchase_price)
    VALUES ('33333333-3333-4333-8333-333333333333', 1, 12, 60);
  `),
  );
  await apply(transition, transition + 1);
  await db.execute(
    sql.raw(`INSERT INTO inventory_balance (product_variant_id, bucket, quantity, updated_by)
    VALUES (1, 'AVAILABLE', 99, '11111111-1111-4111-8111-111111111111'),
           (1, 'DEFECTIVE', 2, '11111111-1111-4111-8111-111111111111');`),
  );
  await apply(transition + 1);
  expect(
    (
      await db.execute(
        sql`SELECT quantity FROM inventory_balance WHERE bucket = 'AVAILABLE' ORDER BY product_variant_id`,
      )
    ).rows,
  ).toEqual([{ quantity: 12 }, { quantity: 0 }, { quantity: 0 }]);
  expect((await db.execute(sql`SELECT quantity FROM inventory_balance WHERE bucket = 'DEFECTIVE'`)).rows).toEqual([
    { quantity: 2 },
  ]);
  expect((await db.execute(sql`SELECT * FROM stock_movement`)).rows).toHaveLength(0);
  expect(
    (await db.execute(sql`SELECT status, tracking_number, record_origin, review_status FROM supplier_order`)).rows,
  ).toEqual([{ status: 'RECEIVED', tracking_number: 'TRACK', record_origin: 'LEGACY_IMPORT', review_status: null }]);
  expect(
    (await db.execute(sql`SELECT quantity_ordered, unit_price, subtotal_price FROM supplier_order_product`)).rows,
  ).toEqual([{ quantity_ordered: 12, unit_price: '60.000000', subtotal_price: '720.000000' }]);
});
