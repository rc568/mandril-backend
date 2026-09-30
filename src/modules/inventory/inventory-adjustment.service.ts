import { and, eq, isNull } from 'drizzle-orm';
import { db, inventoryBalanceTable, productVariantTable, stockMovementTable } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import type { AdjustInventoryDto } from './schemas/inventory.schema';

export class InventoryAdjustmentService {
  adjust = async (dto: AdjustInventoryDto, userId: string) => {
    return db.transaction(async (tx) => {
      // All inventory operations lock the variant first, including absent balance rows.
      const [variant] = await tx
        .select()
        .from(productVariantTable)
        .where(and(eq(productVariantTable.id, dto.productVariantId), isNull(productVariantTable.deletedAt)))
        .for('update');
      if (!variant) throw CustomError.notFound(errorMessages.product.variantNotFoundById);
      const balances = await tx
        .select()
        .from(inventoryBalanceTable)
        .where(eq(inventoryBalanceTable.productVariantId, variant.id))
        .for('update');
      if (variant.quantityInStock !== 0 && !balances.some((balance) => balance.bucket === 'AVAILABLE'))
        throw CustomError.conflict(errorMessages.inventory.balanceNotInitialized);
      const previousQuantity = balances.find((balance) => balance.bucket === dto.bucket)?.quantity ?? 0;
      const difference = dto.countedQuantity - previousQuantity;
      if (difference === 0) return { previousQuantity, quantity: previousQuantity, movement: null };
      await tx
        .insert(inventoryBalanceTable)
        .values({
          productVariantId: variant.id,
          bucket: dto.bucket,
          quantity: dto.countedQuantity,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: [inventoryBalanceTable.productVariantId, inventoryBalanceTable.bucket],
          set: { quantity: dto.countedQuantity, updatedBy: userId },
        });
      const [movement] = await tx
        .insert(stockMovementTable)
        .values({
          productVariantId: variant.id,
          type: 'ADJUSTMENT',
          quantity: Math.abs(difference),
          fromBucket: difference < 0 ? dto.bucket : null,
          toBucket: difference > 0 ? dto.bucket : null,
          unitCostPen: variant.purchasePrice,
          note: dto.reason,
          createdBy: userId,
        })
        .returning();
      return { previousQuantity, quantity: dto.countedQuantity, movement };
    });
  };
}
