import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  db,
  inventoryBalanceTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { calculateWeightedPurchasePrice } from './utils/calculate-weighted-purchase-price';

export interface ReceiptItemFinalCost {
  receiptItemId: string;
  unitCostPen: string | null;
}

export class InventoryService {
  // Supplier Order resolves and saves final costs before calling this internal operation.
  // Passing its transaction keeps cost persistence and inventory posting atomic.
  postPurchaseReceipt = async (
    orderId: string,
    receiptId: string,
    costs: readonly ReceiptItemFinalCost[],
    userId: string,
    tx?: Transaction,
  ) => {
    if (tx) return this.postReceipt(orderId, receiptId, costs, userId, tx);
    return db.transaction((transaction) => this.postReceipt(orderId, receiptId, costs, userId, transaction));
  };

  private postReceipt = async (
    orderId: string,
    receiptId: string,
    costs: readonly ReceiptItemFinalCost[],
    userId: string,
    tx: Transaction,
  ) => {
    const [order] = await tx.select().from(supplierOrderTable).where(eq(supplierOrderTable.id, orderId)).for('update');
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    if (order.recordOrigin !== 'SYSTEM' || !['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status)) {
      throw CustomError.conflict(errorMessages.inventory.receiptNotReady);
    }
    const [receipt] = await tx
      .select()
      .from(supplierOrderReceiptTable)
      .where(and(eq(supplierOrderReceiptTable.id, receiptId), eq(supplierOrderReceiptTable.supplierOrderId, orderId)))
      .for('update');
    if (!receipt) throw CustomError.notFound(errorMessages.inventory.receiptNotFound);
    if (receipt.reviewStatus !== 'COMPLETED') throw CustomError.conflict(errorMessages.inventory.receiptNotReady);

    const items = await tx
      .select()
      .from(supplierOrderReceiptItemTable)
      .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId))
      .orderBy(asc(supplierOrderReceiptItemTable.id))
      .for('update');
    const costsByItem = new Map(costs.map((cost) => [cost.receiptItemId, cost.unitCostPen]));
    if (
      items.length === 0 ||
      costs.length !== items.length ||
      costsByItem.size !== costs.length ||
      items.some((item) => !costsByItem.has(item.id))
    ) {
      throw CustomError.badRequest(errorMessages.inventory.receiptCostsIncomplete);
    }
    const entries = items.map((item) => ({ ...item, unitCostPen: costsByItem.get(item.id) ?? null }));
    const [previous] = await tx
      .select({ id: stockMovementTable.id })
      .from(stockMovementTable)
      .where(
        inArray(
          stockMovementTable.supplierOrderReceiptItemId,
          items.map((item) => item.id),
        ),
      )
      .limit(1);
    if (previous) throw CustomError.conflict(errorMessages.inventory.receiptAlreadyPosted);

    // Always lock variants in the same order, including those without balance rows yet.
    const variantIds = [...new Set(items.map((item) => item.productVariantId))].sort((a, b) => a - b);
    const variants = await tx
      .select()
      .from(productVariantTable)
      .where(inArray(productVariantTable.id, variantIds))
      .orderBy(asc(productVariantTable.id))
      .for('update');
    const balances = await tx
      .select()
      .from(inventoryBalanceTable)
      .where(inArray(inventoryBalanceTable.productVariantId, variantIds))
      .orderBy(asc(inventoryBalanceTable.productVariantId), asc(inventoryBalanceTable.bucket))
      .for('update');

    for (const variant of variants) {
      const variantBalances = balances.filter((balance) => balance.productVariantId === variant.id);
      const availableBalance = variantBalances.find((balance) => balance.bucket === 'AVAILABLE');
      const available = availableBalance?.quantity ?? 0;
      const reserved = variantBalances.find((balance) => balance.bucket === 'RESERVED')?.quantity ?? 0;
      const defective = variantBalances.find((balance) => balance.bucket === 'DEFECTIVE')?.quantity ?? 0;
      const received = entries.filter((item) => item.productVariantId === variant.id);
      const purchasePrice = calculateWeightedPurchasePrice({
        currentPurchasePrice: variant.purchasePrice,
        currentAvailableQuantity: available,
        currentReservedQuantity: reserved,
        receiptItems: received,
      });
      const availableAdded = received.reduce((sum, item) => sum + BigInt(item.availableQuantity), 0n);
      const defectiveAdded = received.reduce((sum, item) => sum + BigInt(item.defectiveQuantity), 0n);
      const nextAvailable = BigInt(available) + availableAdded;
      const nextDefective = BigInt(defective) + defectiveAdded;
      if (nextAvailable > 2147483647n || nextDefective > 2147483647n) {
        throw CustomError.conflict(errorMessages.inventory.balanceOverflow);
      }

      for (const [bucket, quantity, added] of [
        ['AVAILABLE', nextAvailable, availableAdded],
        ['DEFECTIVE', nextDefective, defectiveAdded],
      ] as const) {
        if (added === 0n) continue;
        await tx
          .insert(inventoryBalanceTable)
          .values({
            productVariantId: variant.id,
            bucket,
            quantity: Number(quantity),
            updatedBy: userId,
          })
          .onConflictDoUpdate({
            target: [inventoryBalanceTable.productVariantId, inventoryBalanceTable.bucket],
            set: { quantity: Number(quantity), updatedBy: userId },
          });
      }
      if (availableAdded > 0n) {
        await tx
          .update(productVariantTable)
          .set({ purchasePrice, updatedBy: userId })
          .where(eq(productVariantTable.id, variant.id));
      }
    }

    const movements = entries.flatMap((item) => {
      const common = {
        productVariantId: item.productVariantId,
        type: 'PURCHASE' as const,
        purchaseId: orderId,
        supplierOrderReceiptItemId: item.id,
        unitCostPen: item.unitCostPen,
        createdBy: userId,
      };
      return [
        ...(item.availableQuantity > 0
          ? [{ ...common, toBucket: 'AVAILABLE' as const, quantity: item.availableQuantity }]
          : []),
        ...(item.defectiveQuantity > 0
          ? [{ ...common, toBucket: 'DEFECTIVE' as const, quantity: item.defectiveQuantity }]
          : []),
      ];
    });
    await tx.insert(stockMovementTable).values(movements);
    return { receiptId, inventoryPosted: true };
  };
}
