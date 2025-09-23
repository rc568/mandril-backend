import { eq } from 'drizzle-orm';
import type { Transaction } from '../../db';
import { skuCounterTable } from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';

export class SkuCounter {
  create = async (prefix: string, tx: Transaction): Promise<string> => {
    const currentValue = await tx.query.skuCounterTable.findFirst({
      columns: { value: true, prefix: true },
      where: eq(skuCounterTable.prefix, prefix),
    });

    if (!currentValue) {
      throw CustomError.internalServer('SKU cannot be generated. Contact the administrator.');
    }

    await tx
      .update(skuCounterTable)
      .set({ value: currentValue.value + 1 })
      .where(eq(skuCounterTable.prefix, prefix));

    return `${currentValue.prefix}${currentValue.value.toString().padStart(3, '0')}`;
  };
}
