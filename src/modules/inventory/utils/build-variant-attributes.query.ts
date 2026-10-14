import { eq, sql } from 'drizzle-orm';
import { db, productVariantToValueTable, variantAttributeTable, variantAttributeValueTable } from '@/shared/db';

export const buildVariantAttributesQuery = () =>
  db
    .select({
      productVariantId: productVariantToValueTable.productVariantId,
      variantAttributes: sql<{ variantAttribute: string; variantValue: string }[]>`
        json_agg(
          json_build_object(
            'value', ${variantAttributeValueTable.value},
            'attribute', ${variantAttributeTable.name}
          )
          ORDER BY ${variantAttributeTable.name}
        )
      `.as('variantAttributes'),
    })
    .from(productVariantToValueTable)
    .innerJoin(
      variantAttributeValueTable,
      eq(variantAttributeValueTable.id, productVariantToValueTable.variantAttributeValueId),
    )
    .innerJoin(variantAttributeTable, eq(variantAttributeTable.id, variantAttributeValueTable.variantAttributeId))
    .groupBy(productVariantToValueTable.productVariantId)
    .as('variant_attributes');
