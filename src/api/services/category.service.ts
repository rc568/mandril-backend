import { and, count, eq, isNull } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { categoryTable, productTable } from '../../db/schemas';
import { CustomError, errorCodes } from '../../domain/errors';
import { errorMessages } from '../../domain/messages';
import { createColumnReferences } from '../utils';
import type { CategoryDto, CategoryUpdateDto } from '../validators';

const columnsToSelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
} as const;

export class CategoryService {
  private slugExists = async (slug: string): Promise<boolean> => {
    const product = await db.query.categoryTable.findFirst({
      where: eq(categoryTable.slug, slug),
    });

    if (!product) return false;
    return true;
  };
  getAll = async () => {
    return await db.query.categoryTable.findMany({
      columns: columnsToSelect,
    });
  };

  getById = async (id: number, tx?: Transaction) => {
    const executor = tx ?? db;
    const category = await executor.query.categoryTable.findFirst({
      columns: columnsToSelect,
      where: and(isNull(categoryTable.deletedAt), eq(categoryTable.id, id)),
    });

    if (!category) throw CustomError.notFound(errorMessages.category.notFound);

    return category;
  };

  create = async (category: CategoryDto, userId: string) => {
    const { slug } = category;
    if (await this.slugExists(slug)) throw CustomError.conflict(errorMessages.category.slugExists);

    const [newCategory] = await db
      .insert(categoryTable)
      .values({ ...category, createdBy: userId })
      .returning(createColumnReferences(columnsToSelect, categoryTable));
    return newCategory;
  };

  softDelete = async (id: number, force = false, userId: string): Promise<boolean> => {
    await db.transaction(async (tx) => {
      await this.getById(id, tx);

      const [countProduct] = await tx
        .select({ count: count() })
        .from(productTable)
        .where(and(isNull(productTable.deletedAt), eq(productTable.categoryId, id)));

      if (!force && countProduct.count > 0) {
        throw CustomError.conflict(errorMessages.category.hasActiveProducts, errorCodes.CATEGORY_HAS_ACTIVE_PRODUCT);
      }

      if (force && countProduct.count > 0) {
        await tx
          .update(productTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(productTable.categoryId, id));
      }

      await tx.update(categoryTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(categoryTable.id, id));
    });
    return true;
  };

  update = async (id: number, data: CategoryUpdateDto, userId: string) => {
    const { slug } = data;
    if (slug && (await this.slugExists(slug))) throw CustomError.conflict(errorMessages.category.slugExists);

    await this.getById(id);
    const [updateCategory] = await db
      .update(categoryTable)
      .set({ ...data, updatedBy: userId })
      .where(eq(categoryTable.id, id))
      .returning(createColumnReferences(columnsToSelect, categoryTable));

    return updateCategory;
  };
}
