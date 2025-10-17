import { eq } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { variantAttributeTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { errorMessages } from '../../domain/messages';
import { createColumnReferences } from '../utils';
import type { VariantAttributeDto, VariantAttributeUpdateDto } from '../validators';

const columnsToSelectBool = {
  id: true,
  name: true,
  description: true,
} as const;

export class VariantAttributeService {
  private nameExists = async (name: string): Promise<boolean> => {
    const attribute = await db.query.variantAttributeTable.findFirst({
      where: eq(variantAttributeTable.name, name),
      columns: { id: true },
    });

    if (!attribute) return false;
    return true;
  };

  getAll = async () => {
    return await db.query.variantAttributeTable.findMany({
      columns: columnsToSelectBool,
    });
  };

  getById = async (id: number, tx?: Transaction) => {
    const executor = tx ?? db;
    const attribute = await executor.query.variantAttributeTable.findFirst({
      where: eq(variantAttributeTable.id, id),
      columns: columnsToSelectBool,
    });

    if (!attribute) throw CustomError.notFound(errorMessages.variantAttribue.notFound);

    return attribute;
  };

  create = async (attribute: VariantAttributeDto) => {
    if (await this.nameExists(attribute.name)) throw CustomError.conflict(errorMessages.variantAttribue.nameExists);
    const [newAttribute] = await db
      .insert(variantAttributeTable)
      .values(attribute)
      .returning(createColumnReferences(columnsToSelectBool, variantAttributeTable));

    return newAttribute;
  };

  delete = async (id: number): Promise<boolean> => {
    await this.getById(id);
    await db.delete(variantAttributeTable).where(eq(variantAttributeTable.id, id));
    return true;
  };

  update = async (id: number, attribute: VariantAttributeUpdateDto) => {
    await this.getById(id);

    if (attribute.name && (await this.nameExists(attribute.name)))
      throw CustomError.conflict(errorMessages.variantAttribue.nameExists);

    const [updateCatalog] = await db
      .update(variantAttributeTable)
      .set(attribute)
      .where(eq(variantAttributeTable.id, id))
      .returning(createColumnReferences(columnsToSelectBool, variantAttributeTable));

    return updateCatalog;
  };
}
