import { eq } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { catalogTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { createColumnReferences } from '../utils';
import type { CatalogDto, CatalogUpdateDto } from '../validators';

const columnsToSelect = {
  id: true,
  name: true,
  slug: true,
} as const;

export class CatalogService {
  private slugExists = async (slug: string): Promise<boolean> => {
    const catalog = await db.query.catalogTable.findFirst({
      where: eq(catalogTable.slug, slug),
    });
    if (!catalog) return false;
    return true;
  };

  getAll = async () => {
    return await db.query.catalogTable.findMany({
      columns: columnsToSelect,
    });
  };

  getById = async (id: number, tx?: Transaction) => {
    const executor = tx ?? db;
    const catalog = await executor.query.catalogTable.findFirst({
      where: eq(catalogTable.id, id),
      columns: columnsToSelect,
    });

    if (!catalog) throw CustomError.badRequest(`Catalog with ${id} not found`);

    return catalog;
  };

  create = async (catalog: CatalogDto) => {
    if (await this.slugExists(catalog.slug)) throw CustomError.conflict('Slug already exists in database.');
    const [newCatalog] = await db
      .insert(catalogTable)
      .values(catalog)
      .returning(createColumnReferences(columnsToSelect, catalogTable));

    return newCatalog;
  };

  delete = async (id: number): Promise<boolean> => {
    await this.getById(id);
    await db.delete(catalogTable).where(eq(catalogTable.id, id));
    return true;
  };

  update = async (id: number, data: CatalogUpdateDto) => {
    if (data.slug && (await this.slugExists(data.slug))) throw CustomError.conflict('Slug already exists in database.');

    await this.getById(id);
    const [updateCatalog] = await db
      .update(catalogTable)
      .set(data)
      .where(eq(catalogTable.id, id))
      .returning(createColumnReferences(columnsToSelect, catalogTable));

    return updateCatalog;
  };
}
