import { and, eq } from 'drizzle-orm';
import { db, productVariantToValueTable, type Transaction, variantAttributeValueTable } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { createColumnReferences } from '@/shared/utils';
import { findAttributeById } from './domain/variant-attribute.repository';
import type {
  VariantAttributeValueDto,
  VariantAttributeValueUpdateDto,
} from './schemas/variant-attribute-value.schema';

const columnsToSelect = {
  id: true,
  value: true,
} as const;

export class VariantAttributeValueService {
  valueExists = async (attributeId: number, valueId: number, tx?: Transaction) => {
    const executor = tx ?? db;

    const value = await executor.query.variantAttributeValueTable.findFirst({
      columns: { value: true },
      where: and(
        eq(variantAttributeValueTable.id, valueId),
        eq(variantAttributeValueTable.variantAttributeId, attributeId),
      ),
    });

    return !!value;
  };

  private valueNameExists = async (attributeId: number, name: string, tx: Transaction) => {
    const value = await tx.query.variantAttributeValueTable.findFirst({
      columns: { value: true },
      where: and(
        eq(variantAttributeValueTable.value, name),
        eq(variantAttributeValueTable.variantAttributeId, attributeId),
      ),
    });

    return !!value;
  };

  getAllById = async (attributeId: number) => {
    const attribute = await findAttributeById(attributeId);
    if (!attribute) throw CustomError.notFound(errorMessages.variantAttribue.notFound);

    const values = await db.query.variantAttributeValueTable.findMany({
      where: eq(variantAttributeValueTable.variantAttributeId, attributeId),
      columns: columnsToSelect,
    });

    return {
      attribute: attribute,
      values: values,
    };
  };

  create = async (attributeId: number, attributeValue: VariantAttributeValueDto) => {
    return await db.transaction(async (tx) => {
      const attribute = await findAttributeById(attributeId, tx);
      if (!attribute) throw CustomError.notFound(errorMessages.variantAttribue.notFound);

      if (await this.valueNameExists(attributeId, attributeValue.value, tx))
        throw CustomError.conflict(errorMessages.variantAttribueValue.valueExists);

      const [newValue] = await db
        .insert(variantAttributeValueTable)
        .values({
          value: attributeValue.value,
          variantAttributeId: attributeId,
        })
        .returning(createColumnReferences(columnsToSelect, variantAttributeValueTable));

      return newValue;
    });
  };

  update = async (attributeId: number, valueId: number, attributeValueDto: VariantAttributeValueUpdateDto) => {
    return await db.transaction(async (tx) => {
      const attribute = await findAttributeById(attributeId, tx);
      if (!attribute) throw CustomError.notFound(errorMessages.variantAttribue.notFound);

      const valueExists = await this.valueExists(attributeId, valueId, tx);
      if (!valueExists) throw CustomError.notFound(errorMessages.variantAttribueValue.valueExists);

      if (attributeValueDto.value && (await this.valueNameExists(attributeId, attributeValueDto.value, tx)))
        throw CustomError.conflict(errorMessages.variantAttribueValue.valueExists);

      const [updateValue] = await db
        .update(variantAttributeValueTable)
        .set(attributeValueDto)
        .where(
          and(
            eq(variantAttributeValueTable.id, valueId),
            eq(variantAttributeValueTable.variantAttributeId, attributeId),
          ),
        )
        .returning(createColumnReferences(columnsToSelect, variantAttributeValueTable));

      return updateValue;
    });
  };

  delete = async (valueId: number) => {
    return await db.transaction(async (tx) => {
      const value = await tx.query.variantAttributeValueTable.findFirst({
        where: eq(variantAttributeValueTable.id, valueId),
        columns: { id: true },
      });

      if (!value) throw CustomError.notFound(errorMessages.variantAttribueValue.valueNotFound);

      const valueInUse = await tx.query.productVariantToValueTable.findFirst({
        where: eq(productVariantToValueTable.variantAttributeValueId, valueId),
        columns: { variantAttributeValueId: true },
      });

      if (valueInUse) throw CustomError.conflict(errorMessages.variantAttribueValue.valueIsReferenced);

      await tx.delete(variantAttributeValueTable).where(eq(variantAttributeValueTable.id, valueId));

      return true;
    });
  };
}
