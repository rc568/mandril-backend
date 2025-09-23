import { eq } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { categoryTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { createColumnReferences } from '../utils';
import type { CategoryDto, CategoryUpdateDto } from '../validators/category.validator';

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
      where: eq(categoryTable.id, id),
    });

    if (!category) throw CustomError.notFound(`Category with id ${id} not found`);

    return category;
  };

  create = async (category: CategoryDto) => {
    const { slug } = category;
    if (await this.slugExists(slug)) throw CustomError.conflict('Slug already exists.');

    const [newCategory] = await db
      .insert(categoryTable)
      .values(category)
      .returning(createColumnReferences(columnsToSelect, categoryTable));
    return newCategory;
  };

  delete = async (id: number): Promise<boolean> => {
    await this.getById(id);
    await db.delete(categoryTable).where(eq(categoryTable.id, id));
    return true;
  };

  update = async (id: number, data: CategoryUpdateDto) => {
    const { slug } = data;
    if (slug && (await this.slugExists(slug))) throw CustomError.conflict('Slug already exists.');

    await this.getById(id);
    const [updateCategory] = await db
      .update(categoryTable)
      .set(data)
      .where(eq(categoryTable.id, id))
      .returning(createColumnReferences(columnsToSelect, categoryTable));

    return updateCategory;
  };
}
