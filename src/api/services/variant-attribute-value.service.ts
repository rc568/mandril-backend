import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { variantAttributeValueTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { createColumnReferences } from '../utils';
import type { VariantAttributeValueDto, VariantAttributeValueUpdateDto } from '../validators';
import type { VariantAttributeService } from '.';

const columnsToSelect = {
  id: true,
  value: true,
} as const;

export class VariantAttributeValueService {
  constructor(private readonly variantAttributeService: VariantAttributeService) {}

  private valueExists = async (attributeId: number, valueId: number) => {
    const value = await db.query.variantAttributeValueTable.findFirst({
      columns: { value: true },
      where: and(
        eq(variantAttributeValueTable.id, valueId),
        eq(variantAttributeValueTable.variantAttributeId, attributeId),
      ),
    });

    if (!value) return false;
    return true;
  };

  private nameExists = async (attributeId: number, name: string) => {
    const value = await db.query.variantAttributeValueTable.findFirst({
      columns: { value: true },
      where: and(
        eq(variantAttributeValueTable.value, name),
        eq(variantAttributeValueTable.variantAttributeId, attributeId),
      ),
    });

    if (!value) return false;
    return true;
  };

  getAllById = async (attributeId: number) => {
    await this.variantAttributeService.getById(attributeId);

    return await db.query.variantAttributeValueTable.findMany({
      where: eq(variantAttributeValueTable.variantAttributeId, attributeId),
      columns: columnsToSelect,
    });
  };

  create = async (attributeId: number, attributeValue: VariantAttributeValueDto) => {
    const { name } = await this.variantAttributeService.getById(attributeId);

    if (await this.nameExists(attributeId, attributeValue.value))
      throw CustomError.conflict(`Value ${attributeValue.value} already exists in attribute ${name}`);
    const { value } = attributeValue;

    const [newValue] = await db
      .insert(variantAttributeValueTable)
      .values({
        value,
        variantAttributeId: attributeId,
      })
      .returning(createColumnReferences(columnsToSelect, variantAttributeValueTable));

    return newValue;
  };

  update = async (attributeId: number, valueId: number, attributeValue: VariantAttributeValueUpdateDto) => {
    const { name } = await this.variantAttributeService.getById(attributeId);
    const doesValueExists = await this.valueExists(attributeId, valueId);
    if (!doesValueExists)
      throw CustomError.notFound(`Value with id ${valueId} doesn't exist in corresponding attribute`);

    if (attributeValue.value && (await this.nameExists(attributeId, attributeValue.value)))
      throw CustomError.conflict(`Value ${attributeValue.value} already exists in attribute ${name}`);

    const [updateValue] = await db
      .update(variantAttributeValueTable)
      .set(attributeValue)
      .where(
        and(eq(variantAttributeValueTable.id, valueId), eq(variantAttributeValueTable.variantAttributeId, attributeId)),
      )
      .returning(createColumnReferences(columnsToSelect, variantAttributeValueTable));

    return updateValue;
  };

  delete = async (valueId: number) => {
    const value = await db.query.variantAttributeValueTable.findFirst({
      where: eq(variantAttributeValueTable.id, valueId),
    });

    if (!value) throw CustomError.notFound(`Value with id ${valueId} doesn't exist.`);

    await db.delete(variantAttributeValueTable).where(eq(variantAttributeValueTable.id, valueId));

    return true;
  };
}
