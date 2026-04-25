import { eq } from 'drizzle-orm';
import {
  db,
  productVariantToValueTable,
  type Transaction,
  variantAttributeTable,
  variantAttributeValueTable,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { createColumnReferences } from '@/shared/utils';
import { findAttributeById } from './domain/variant-attribute.repository';
import type { VariantAttributeDto, VariantAttributeUpdateDto } from './schemas/variant-attribute.schema';

const columnsToSelectBool = {
  id: true,
  name: true,
  description: true,
} as const;

export class VariantAttributeService {
  private nameExists = async (name: string, tx: Transaction): Promise<boolean> => {
    const attribute = await tx.query.variantAttributeTable.findFirst({
      where: eq(variantAttributeTable.name, name),
      columns: { id: true },
    });

    return !!attribute;
  };

  getAll = async () => {
    return await db.query.variantAttributeTable.findMany({
      columns: columnsToSelectBool,
    });
  };

  getById = async (id: number, tx?: Transaction) => {
    const attribute = await findAttributeById(id, tx);
    if (!attribute) throw CustomError.notFound(errorMessages.variantAttribue.notFound);

    return attribute;
  };

  create = async (attribute: VariantAttributeDto) => {
    return await db.transaction(async (tx) => {
      if (await this.nameExists(attribute.name, tx)) {
        throw CustomError.conflict(errorMessages.variantAttribue.nameExists);
      }

      const [newAttribute] = await tx
        .insert(variantAttributeTable)
        .values(attribute)
        .returning(createColumnReferences(columnsToSelectBool, variantAttributeTable));

      return newAttribute;
    });
  };

  delete = async (id: number): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      await this.getById(id, tx);

      const attributeInUse = await tx.query.productVariantToValueTable.findFirst({
        where: eq(productVariantToValueTable.variantAttributeId, id),
        columns: { variantAttributeId: true },
      });
      if (attributeInUse) throw CustomError.conflict(errorMessages.variantAttribue.attributeIsReferenced);

      const attributeHasValues = await tx.query.variantAttributeValueTable.findFirst({
        where: eq(variantAttributeValueTable.id, id),
        columns: { id: true },
      });
      if (attributeHasValues) throw CustomError.conflict(errorMessages.variantAttribue.attributeHasValues);

      await tx.delete(variantAttributeTable).where(eq(variantAttributeTable.id, id));
      return true;
    });
  };

  update = async (id: number, attribute: VariantAttributeUpdateDto) => {
    return await db.transaction(async (tx) => {
      await this.getById(id, tx);

      if (attribute.name && (await this.nameExists(attribute.name, tx)))
        throw CustomError.conflict(errorMessages.variantAttribue.nameExists);

      const [updateCatalog] = await tx
        .update(variantAttributeTable)
        .set(attribute)
        .where(eq(variantAttributeTable.id, id))
        .returning(createColumnReferences(columnsToSelectBool, variantAttributeTable));

      return updateCatalog;
    });
  };
}
