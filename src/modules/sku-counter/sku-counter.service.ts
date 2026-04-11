import { eq } from 'drizzle-orm';
import { skuCounterTable, type Transaction } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';

export class SkuCounterService {
  create = async (prefix: string, tx: Transaction): Promise<string> => {
    const currentValue = await tx.query.skuCounterTable.findFirst({
      columns: { value: true, prefix: true },
      where: eq(skuCounterTable.prefix, prefix),
    });

    if (!currentValue) {
      throw CustomError.internalServer(errorMessages.skuCounter.errorGenerating);
    }

    await tx
      .update(skuCounterTable)
      .set({ value: currentValue.value + 1 })
      .where(eq(skuCounterTable.prefix, prefix));

    return `${currentValue.prefix}${currentValue.value.toString().padStart(3, '0')}`;
  };
}
