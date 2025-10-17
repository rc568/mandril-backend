import { and, count, eq, isNull } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { catalogTable, productTable } from '../../db/schemas';
import { CustomError, errorCodes } from '../../domain/errors';
import { errorMessages } from '../../domain/messages';
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
      where: and(isNull(catalogTable.deletedAt), eq(catalogTable.id, id)),
      columns: columnsToSelect,
    });

    if (!catalog) throw CustomError.notFound(errorMessages.catalog.notFound);

    return catalog;
  };

  create = async (catalog: CatalogDto, userId: string) => {
    if (await this.slugExists(catalog.slug)) throw CustomError.conflict(errorMessages.catalog.slugExists);
    const [newCatalog] = await db
      .insert(catalogTable)
      .values({ ...catalog, createdBy: userId })
      .returning(createColumnReferences(columnsToSelect, catalogTable));

    return newCatalog;
  };

  delete = async (id: number, force = false, userId: string): Promise<boolean> => {
    await db.transaction(async (tx) => {
      await this.getById(id, tx);

      const [countProduct] = await tx
        .select({ count: count() })
        .from(productTable)
        .where(and(isNull(productTable.deletedAt), eq(productTable.catalogId, id)));

      if (!force && countProduct.count > 0) {
        throw CustomError.conflict(errorMessages.catalog.hasActiveProducts, errorCodes.CATALOG_HAS_ACTIVE_PRODUCT);
      }

      if (force && countProduct.count > 0) {
        await tx
          .update(productTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(productTable.catalogId, id));
      }

      await tx.update(catalogTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(catalogTable.id, id));
    });
    return true;
  };

  update = async (id: number, data: CatalogUpdateDto, userId: string) => {
    if (data.slug && (await this.slugExists(data.slug))) throw CustomError.conflict(errorMessages.catalog.slugExists);

    await this.getById(id);
    const [updateCatalog] = await db
      .update(catalogTable)
      .set({ ...data, updatedBy: userId })
      .where(eq(catalogTable.id, id))
      .returning(createColumnReferences(columnsToSelect, catalogTable));

    return updateCatalog;
  };
}
