import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupplierService } from '@/modules/supplier-order';
import { createSupplierSchema, updateSupplierSchema } from '@/modules/supplier-order/schemas/supplier.schema';
import { db, supplierOrderTable, supplierTable, userTable } from '@/shared/db';
import * as schema from '@/shared/db/schemas';
import { DEFAULT_LIMIT, errorMessages } from '@/shared/domain';
import { assertTestDatabase } from '../support/database';

const service = new SupplierService();
// Drizzle Kit's CommonJS entry supports its internal Node.js requires.
const { generateDrizzleJson, generateMigration } = createRequire(import.meta.url)(
  'drizzle-kit/api',
) as typeof import('drizzle-kit/api');
let userId: string;
let editorId: string;
let tag: string;

beforeAll(async () => {
  // Only this project's disposable database is reset; the guard lives outside public.
  await assertTestDatabase();
  const statements = await generateMigration(
    generateDrizzleJson({}, undefined, undefined, 'snake_case'),
    generateDrizzleJson(schema, undefined, undefined, 'snake_case'),
  );
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
    for (const statement of statements) await tx.execute(sql.raw(statement));
  });
});

beforeEach(async () => {
  await assertTestDatabase();
  tag = randomUUID();
  const users = await db
    .insert(userTable)
    .values(
      ['creator', 'editor'].map((role) => ({
        name: role,
        lastName: 'Supplier test',
        userName: `${role}-${tag}`,
        email: `${role}-${tag}@example.test`,
        password: 'unused',
      })),
    )
    .returning();
  userId = users[0].id;
  editorId = users[1].id;
});

const create = (changes: Record<string, unknown> = {}) =>
  service.create(createSupplierSchema.parse({ name: `Proveedor ${tag}`, ...changes }), userId);

describe('servicio de proveedores', () => {
  it('crea y consulta un proveedor con auditoría', async () => {
    const supplier = await create({ description: 'Importador' });
    expect(supplier).toMatchObject({
      name: `Proveedor ${tag}`,
      description: 'Importador',
      isActive: true,
      createdBy: userId,
      updatedBy: null,
    });
    expect(supplier.createdAt).toBeInstanceOf(Date);
    expect(await service.getById(supplier.id)).toEqual(supplier);
  });

  it('edita solo lo enviado y permite limpiar la descripción', async () => {
    const original = await create({ description: 'Antes' });
    const updated = await service.update(original.id, updateSupplierSchema.parse({ name: 'Nuevo nombre' }), editorId);
    expect(updated).toMatchObject({
      name: 'Nuevo nombre',
      description: 'Antes',
      isActive: true,
      createdBy: userId,
      createdAt: original.createdAt,
      updatedBy: editorId,
    });
    expect(updated.updatedAt).toBeInstanceOf(Date);
    expect(await service.update(original.id, { description: null }, editorId)).toMatchObject({
      description: null,
      name: 'Nuevo nombre',
    });
  });

  it('desactiva y reactiva sin perder referencias de compras', async () => {
    const supplier = await create();
    const [purchase] = await db
      .insert(supplierOrderTable)
      .values({ supplierId: supplier.id, createdBy: userId })
      .returning();
    await service.update(supplier.id, { isActive: false }, editorId);
    expect(await service.getById(supplier.id)).toMatchObject({ isActive: false });
    expect(
      await db.query.supplierOrderTable.findFirst({ where: eq(supplierOrderTable.id, purchase.id) }),
    ).toMatchObject({ supplierId: supplier.id });
    expect(await service.update(supplier.id, { isActive: true }, editorId)).toMatchObject({ isActive: true });
  });

  it('devuelve 404 al consultar o editar un proveedor inexistente', async () => {
    const missingId = randomUUID();
    await expect(service.getById(missingId)).rejects.toMatchObject({
      statusCode: 404,
      message: errorMessages.supplier.notFound,
    });
    await expect(service.update(missingId, { name: 'Ausente' }, editorId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rechaza ediciones vacías sin modificar la auditoría', async () => {
    const supplier = await create();
    await expect(service.update(supplier.id, {}, editorId)).rejects.toMatchObject({ statusCode: 400 });
    expect(await service.getById(supplier.id)).toEqual(supplier);
  });

  it('combina búsqueda sin distinguir mayúsculas con estado activo o inactivo', async () => {
    const active = await create();
    const inactive = await create({ isActive: false });
    expect((await service.getAll({ search: `PROVEEDOR ${tag}`, isActive: true })).suppliers.map((s) => s.id)).toEqual([
      active.id,
    ]);
    expect((await service.getAll({ search: tag, isActive: false })).suppliers.map((s) => s.id)).toEqual([inactive.id]);
    expect((await service.getAll({ search: tag })).pagination.totalItems).toBe(2);
  });

  it.each(['%', '_', '\\'])('trata %s como texto literal en la búsqueda', async (character) => {
    const expected = await create({ name: `${tag}${character}literal` });
    await create({ name: `${tag}Xliteral` });
    expect((await service.getAll({ search: `${tag}${character}` })).suppliers.map((s) => s.id)).toEqual([expected.id]);
  });

  it('pagina con orden estable aun cuando coinciden los nombres', async () => {
    await db.insert(supplierTable).values(Array.from({ length: 25 }, () => ({ name: tag, createdBy: userId })));
    const first = await service.getAll({ search: tag, page: 1, limit: 24 });
    const second = await service.getAll({ search: tag, page: 2, limit: 24 });
    expect(first.suppliers).toHaveLength(24);
    expect(second.suppliers).toHaveLength(1);
    expect(first.pagination).toMatchObject({ totalItems: 25, nextPage: 2 });
    expect(second.pagination).toMatchObject({ prevPage: 1, nextPage: null });
    expect(new Set([...first.suppliers, ...second.suppliers].map((s) => s.id)).size).toBe(25);
    expect((await service.getAll({ search: tag, page: 1, limit: 24 })).suppliers).toEqual(first.suppliers);
  });

  it('normaliza paginación inválida y maneja resultados vacíos', async () => {
    await create();
    expect((await service.getAll({ search: tag, page: -1, limit: 999 })).pagination).toMatchObject({
      page: 1,
      pageSize: DEFAULT_LIMIT,
      totalItems: 1,
    });
    expect((await service.getAll({ search: randomUUID() })).suppliers).toEqual([]);
    expect((await service.getAll({ search: tag, page: 2 })).suppliers).toEqual([]);
  });

  it('consulta dentro de una transacción y respeta su rollback', async () => {
    const id = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(supplierTable).values({ id, name: tag, createdBy: userId });
        expect(await service.getById(id, tx)).toMatchObject({ id });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(service.getById(id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
