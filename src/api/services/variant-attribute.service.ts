import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { variantAttributeTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { objectValueToBoolean } from '../utils';
import type { VariantAttributeDto, VariantAttributeUpdateDto } from '../validators';

const columnsToSelect = {
  id: variantAttributeTable.id,
  name: variantAttributeTable.name,
  description: variantAttributeTable.description,
};

export class VariantAttributeService {
  getAll = async () => {
    return await db.query.variantAttributeTable.findMany({
      columns: objectValueToBoolean(columnsToSelect),
    });
  };

  getById = async (id: number) => {
    const attribute = await db.query.variantAttributeTable.findFirst({
      where: eq(variantAttributeTable.id, id),
      columns: objectValueToBoolean(columnsToSelect),
    });

    if (!attribute) throw CustomError.notFound(`Attribute with id ${id} not found`);

    return attribute;
  };

  create = async (attribute: VariantAttributeDto) => {
    const [newAttribute] = await db.insert(variantAttributeTable).values(attribute).returning(columnsToSelect);

    return newAttribute;
  };

  delete = async (id: number): Promise<boolean> => {
    await this.getById(id);
    await db.delete(variantAttributeTable).where(eq(variantAttributeTable.id, id));
    return true;
  };

  update = async (id: number, data: VariantAttributeUpdateDto) => {
    await this.getById(id);
    const [updateCatalog] = await db
      .update(variantAttributeTable)
      .set(data)
      .where(eq(variantAttributeTable.id, id))
      .returning(columnsToSelect);

    return updateCatalog;
  };
}
