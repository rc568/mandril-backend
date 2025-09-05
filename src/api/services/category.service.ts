import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { categoryTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { objectValueToBoolean } from '../utils';
import type { CategoryDto, CategoryUpdateDto } from '../validators/category.validator';

const columnsToSelect = {
  id: categoryTable.id,
  name: categoryTable.name,
  slug: categoryTable.slug,
  parentId: categoryTable.parentId,
};

export class CategoryService {
  getAll = async () => {
    return await db.query.categoryTable.findMany({
      columns: objectValueToBoolean(columnsToSelect),
    });
  };

  getById = async (id: number) => {
    const category = await db.query.categoryTable.findFirst({
      columns: objectValueToBoolean(columnsToSelect),
      where: eq(categoryTable.id, id),
    });

    if (!category) throw CustomError.notFound(`Category with id ${id} not found`);

    return category;
  };

  create = async (category: CategoryDto) => {
    const [newCategory] = await db
      .insert(categoryTable)
      .values(category)
      .returning(columnsToSelect);
    return newCategory;
  };

  delete = async (id: number): Promise<boolean> => {
    const category = await this.getById(id);
    if (!category) throw CustomError.notFound(`Category with id ${id} not found`);
    await db.delete(categoryTable).where(eq(categoryTable.id, id));
    return true;
  };

  update = async (id: number, data: CategoryUpdateDto) => {
    const category = await this.getById(id);
    if (!category) throw CustomError.notFound(`Category with id ${id} not found`);

    return await db
      .update(categoryTable)
      .set(data)
      .where(eq(categoryTable.id, id))
      .returning(columnsToSelect);
  };
}
