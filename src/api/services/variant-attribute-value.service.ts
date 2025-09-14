import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { variantAttributeValuesTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { objectValueToBoolean } from '../utils';
import type { VariantAttributeValueDto } from '../validators/variant-attribute-value.validator';
import type { VariantAttributeService } from '.';

const columnsToSelect = {
  id: variantAttributeValuesTable.id,
  value: variantAttributeValuesTable.value,
};

export class VariantAttributeValueService {
  constructor(private readonly variantAttributeService: VariantAttributeService) {}

  private valueExists = async (attributeId: number, valueId: number) => {
    await this.variantAttributeService.getById(attributeId);
    const value = await db.query.variantAttributeValuesTable.findFirst({
      columns: { value: true },
      where: and(
        eq(variantAttributeValuesTable.id, valueId),
        eq(variantAttributeValuesTable.variantAttributeId, attributeId),
      ),
    });

    if (!value) return false;
    return true;
  };

  getAllById = async (attributeId: number) => {
    await this.variantAttributeService.getById(attributeId);

    return await db.query.variantAttributeValuesTable.findMany({
      where: eq(variantAttributeValuesTable.variantAttributeId, attributeId),
      columns: objectValueToBoolean(columnsToSelect),
    });
  };

  create = async (attributeId: number, attributeValue: VariantAttributeValueDto) => {
    await this.variantAttributeService.getById(attributeId);
    const { value } = attributeValue;

    const [newValue] = await db
      .insert(variantAttributeValuesTable)
      .values({
        value,
        variantAttributeId: attributeId,
      })
      .returning(columnsToSelect);

    return newValue;
  };

  update = async (attributeId: number, valueId: number, attributeValue: VariantAttributeValueDto) => {
    const doesValueExists = await this.valueExists(attributeId, valueId);
    if (!doesValueExists)
      throw CustomError.notFound(`Value with id ${valueId} doesn't exist in corresponding attribute`);

    const [updateValue] = await db
      .update(variantAttributeValuesTable)
      .set(attributeValue)
      .where(
        and(
          eq(variantAttributeValuesTable.id, valueId),
          eq(variantAttributeValuesTable.variantAttributeId, attributeId),
        ),
      )
      .returning(columnsToSelect);

    return updateValue;
  };

  delete = async (valueId: number) => {
    const value = await db.query.variantAttributeValuesTable.findFirst({
      where: eq(variantAttributeValuesTable.id, valueId),
    });

    if (!value) throw CustomError.notFound(`Value with id ${valueId} doesn't exist in corresponding attribute`);

    await db.delete(variantAttributeValuesTable).where(eq(variantAttributeValuesTable.id, valueId));

    return true;
  };
}
