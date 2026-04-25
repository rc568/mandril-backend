import { and, count, eq, isNull } from 'drizzle-orm';
import { catalogTable, db, productTable, type Transaction } from '@/shared/db';
import { CustomError, errorCodes, errorMessages } from '@/shared/domain';
import { createColumnReferences } from '@/shared/utils';
import type { CatalogDto, CatalogUpdateDto } from './schemas/catalog.schema';

const columnsToSelect = {
  id: true,
  name: true,
  slug: true,
} as const;

export class CatalogService {
  private slugExists = async (slug: string, tx: Transaction): Promise<boolean> => {
    const catalog = await tx.query.catalogTable.findFirst({
      where: eq(catalogTable.slug, slug),
    });

    return !!catalog;
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
    return await db.transaction(async (tx) => {
      if (await this.slugExists(catalog.slug, tx)) throw CustomError.conflict(errorMessages.catalog.slugExists);

      const [newCatalog] = await db
        .insert(catalogTable)
        .values({ ...catalog, createdBy: userId })
        .returning(createColumnReferences(columnsToSelect, catalogTable));

      return newCatalog;
    });
  };

  softDelete = async (id: number, force = false, userId: string): Promise<boolean> => {
    await db.transaction(async (tx) => {
      await this.getById(id, tx);

      if (force) {
        await tx
          .update(productTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(productTable.catalogId, id));
      } else {
        const [countProduct] = await tx
          .select({ count: count() })
          .from(productTable)
          .where(and(isNull(productTable.deletedAt), eq(productTable.catalogId, id)));

        if (countProduct.count > 0) {
          throw CustomError.conflict(errorMessages.catalog.hasActiveProducts, errorCodes.CATALOG_HAS_ACTIVE_PRODUCT);
        }
      }

      await tx.update(catalogTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(catalogTable.id, id));
    });
    return true;
  };

  update = async (id: number, catalogDto: CatalogUpdateDto, userId: string) => {
    await db.transaction(async (tx) => {
      if (catalogDto.slug && (await this.slugExists(catalogDto.slug, tx)))
        throw CustomError.conflict(errorMessages.catalog.slugExists);

      await this.getById(id);
      const [updateCatalog] = await db
        .update(catalogTable)
        .set({ ...catalogDto, updatedBy: userId })
        .where(eq(catalogTable.id, id))
        .returning(createColumnReferences(columnsToSelect, catalogTable));

      return updateCatalog;
    });
  };
}
