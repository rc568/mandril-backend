import { and, count, eq, isNull } from 'drizzle-orm';
import { categoryTable, db, productTable, type Transaction } from '@/shared/db';
import { CustomError, errorCodes, errorMessages } from '@/shared/domain';
import { createColumnReferences } from '@/shared/utils';
import type { CategoryDto, CategoryUpdateDto } from './schemas/category.schema';

const columnsToSelect = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
} as const;

export class CategoryService {
  private slugExists = async (slug: string, tx: Transaction): Promise<boolean> => {
    const category = await tx.query.categoryTable.findFirst({
      where: eq(categoryTable.slug, slug),
    });

    return !!category;
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

  create = async (categoryDto: CategoryDto, userId: string) => {
    return await db.transaction(async (tx) => {
      if (await this.slugExists(categoryDto.slug, tx)) {
        throw CustomError.conflict(errorMessages.category.slugExists);
      }

      if (categoryDto.parentId) {
        const parentCategory = await this.getById(categoryDto.parentId, tx);
        if (!parentCategory) throw CustomError.notFound(errorMessages.category.notFoundParentCategory);
      }

      const [newCategory] = await tx
        .insert(categoryTable)
        .values({ ...categoryDto, createdBy: userId })
        .returning(createColumnReferences(columnsToSelect, categoryTable));
      return newCategory;
    });
  };

  softDelete = async (id: number, force = false, userId: string): Promise<boolean> => {
    await db.transaction(async (tx) => {
      await this.getById(id, tx);

      if (force) {
        await tx
          .update(productTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(productTable.categoryId, id));
      } else {
        const [countProduct] = await tx
          .select({ count: count() })
          .from(productTable)
          .where(and(isNull(productTable.deletedAt), eq(productTable.categoryId, id)));

        if (countProduct.count > 0) {
          throw CustomError.conflict(errorMessages.category.hasActiveProducts, errorCodes.CATEGORY_HAS_ACTIVE_PRODUCT);
        }
      }

      await tx.update(categoryTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(categoryTable.id, id));
    });
    return true;
  };

  update = async (categoryId: number, categoryDto: CategoryUpdateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const { slug } = categoryDto;
      if (slug && (await this.slugExists(slug, tx))) throw CustomError.conflict(errorMessages.category.slugExists);

      if (categoryDto.parentId) {
        const parentCategory = await this.getById(categoryDto.parentId, tx);
        if (!parentCategory) throw CustomError.notFound(errorMessages.category.notFoundParentCategory);

        if (categoryId === categoryDto.parentId)
          throw CustomError.conflict(errorMessages.category.categoryAndParentWithSameId);
      }

      await this.getById(categoryId);
      const [updateCategory] = await tx
        .update(categoryTable)
        .set({ ...categoryDto, updatedBy: userId })
        .where(eq(categoryTable.id, categoryId))
        .returning(createColumnReferences(columnsToSelect, categoryTable));

      return updateCategory;
    });
  };
}
