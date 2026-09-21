import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, inject } from 'vitest';
import { db } from '@/shared/db';

export async function assertTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const token = inject('databaseToken');
  if (
    url.hostname !== '127.0.0.1' ||
    url.username !== 'product_test' ||
    url.pathname !== '/mandril_product_test' ||
    !token
  ) {
    throw new Error('Se rechazó escribir fuera de la base temporal de product.');
  }
  const { rows } = await db.execute(sql`SELECT token FROM product_test_guard.identity WHERE token = ${token}`);
  if (rows.length !== 1) throw new Error('La base de datos no pertenece a esta ejecución.');
}

// Importar este archivo registra estos hooks para cada archivo de integración.
beforeAll(assertTestDatabase);
afterAll(async () => {
  await db.$client.end();
});
