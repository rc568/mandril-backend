import { eq } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import { VariantAttributeService } from '@/modules/variant-attribute';
import { db, variantAttributeTable, variantAttributeValueTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { createFixture, type ProductFixture } from './fixtures';

let fixture: ProductFixture;

beforeEach(async () => {
  fixture = await createFixture();
});

it('prevents deleting an attribute with values that are not assigned to product variants', async () => {
  const attributeId = 30_000;
  const valueId = 30_001;

  await db.insert(variantAttributeTable).values({
    id: attributeId,
    name: 'Unassigned attribute',
    createdBy: fixture.user.id,
  });
  await db.insert(variantAttributeValueTable).values({
    id: valueId,
    value: 'Unassigned value',
    variantAttributeId: attributeId,
    createdBy: fixture.user.id,
  });

  await expect(new VariantAttributeService().delete(attributeId)).rejects.toMatchObject({
    statusCode: 409,
    message: errorMessages.variantAttribue.attributeHasValues,
  });

  expect(
    await db.query.variantAttributeValueTable.findFirst({
      where: eq(variantAttributeValueTable.id, valueId),
    }),
  ).toBeDefined();
});
