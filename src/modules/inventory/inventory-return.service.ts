import { asc, eq, inArray } from 'drizzle-orm';
import {
  inventoryBalanceTable,
  orderProductTable,
  orderTable,
  productVariantTable,
  stockMovementTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { RETURN_CONDITION } from './domain/constants';
import { calculateWeightedPurchasePrice } from './utils/calculate-weighted-purchase-price';

export interface ReturnItemCondition {
  orderProductId: string;
  condition: (typeof RETURN_CONDITION)[number];
}

export class InventoryReturnService {
  // Order Service checks return eligibility and commits the order status in this same transaction.
  complete = async (orderId: string, conditions: readonly ReturnItemCondition[], userId: string, tx: Transaction) => {
    const [order] = await tx.select().from(orderTable).where(eq(orderTable.id, orderId)).for('update');
    if (
      !order ||
      order.status !== 'PENDING' ||
      !['RETURN', 'EXCHANGE'].includes(order.type) ||
      order.deletedAt !== null
    ) {
      throw CustomError.conflict(errorMessages.inventory.returnNotReady);
    }
    const products = await tx.select().from(orderProductTable).where(eq(orderProductTable.orderId, orderId));
    const returns = products.filter((product) => product.type === 'RETURN');
    const byItem = new Map(conditions.map((item) => [item.orderProductId, item.condition]));
    if (
      returns.length === 0 ||
      conditions.length !== returns.length ||
      byItem.size !== conditions.length ||
      returns.some((product) => !byItem.has(product.id)) ||
      conditions.some((item) => !RETURN_CONDITION.includes(item.condition))
    ) {
      throw CustomError.badRequest(errorMessages.inventory.returnConditionsRequired);
    }
    if (order.type === 'RETURN' && products.some((product) => product.type !== 'RETURN')) {
      throw CustomError.badRequest(errorMessages.order.invalidProductsTypeForReturnOrder);
    }
    const [posted] = await tx
      .select({ id: stockMovementTable.id })
      .from(stockMovementTable)
      .where(eq(stockMovementTable.orderId, orderId))
      .limit(1);
    if (posted) throw CustomError.conflict(errorMessages.inventory.orderAlreadyPosted);
    const variantIds = [...new Set(products.map((product) => product.productVariantId))].sort((a, b) => a - b);
    const variants = await tx
      .select()
      .from(productVariantTable)
      .where(inArray(productVariantTable.id, variantIds))
      .orderBy(asc(productVariantTable.id))
      .for('update');
    if (variants.length !== variantIds.length) throw CustomError.notFound(errorMessages.product.variantNotFoundById);
    const balances = await tx
      .select()
      .from(inventoryBalanceTable)
      .where(inArray(inventoryBalanceTable.productVariantId, variantIds))
      .orderBy(asc(inventoryBalanceTable.productVariantId), asc(inventoryBalanceTable.bucket))
      .for('update');
    for (const variant of variants) {
      const rows = balances.filter((balance) => balance.productVariantId === variant.id);
      const available = rows.find((balance) => balance.bucket === 'AVAILABLE');
      if (!available && variant.quantityInStock !== 0)
        throw CustomError.conflict(errorMessages.inventory.balanceNotInitialized);
      const lines = products.filter((product) => product.productVariantId === variant.id);
      const sold = lines
        .filter((product) => product.type === 'SALE')
        .reduce((sum, product) => sum + BigInt(product.quantity), 0n);
      const availableAfterSale = BigInt(available?.quantity ?? 0) - sold;
      if (availableAfterSale < 0n) throw CustomError.conflict(errorMessages.order.outOfStock);
      const returned = lines.filter((product) => product.type === 'RETURN');
      for (const bucket of RETURN_CONDITION) {
        const added = returned
          .filter((product) => byItem.get(product.id) === bucket)
          .reduce((sum, product) => sum + BigInt(product.quantity), 0n);
        if (added === 0n && (bucket !== 'AVAILABLE' || sold === 0n)) continue;
        const previous =
          bucket === 'AVAILABLE'
            ? availableAfterSale
            : BigInt(rows.find((balance) => balance.bucket === bucket)?.quantity ?? 0);
        const quantity = previous + added;
        if (quantity > 2147483647n) throw CustomError.conflict(errorMessages.inventory.balanceOverflow);
        await tx
          .insert(inventoryBalanceTable)
          .values({ productVariantId: variant.id, bucket, quantity: Number(quantity), updatedBy: userId })
          .onConflictDoUpdate({
            target: [inventoryBalanceTable.productVariantId, inventoryBalanceTable.bucket],
            set: { quantity: Number(quantity), updatedBy: userId },
          });
      }
      const goodReturns = returned.filter((product) => byItem.get(product.id) === 'AVAILABLE');
      if (goodReturns.length > 0) {
        const purchasePrice = calculateWeightedPurchasePrice({
          currentPurchasePrice: variant.purchasePrice,
          currentAvailableQuantity: Number(availableAfterSale),
          currentReservedQuantity: rows.find((balance) => balance.bucket === 'RESERVED')?.quantity ?? 0,
          receiptItems: goodReturns.map((product) => ({
            availableQuantity: product.quantity,
            defectiveQuantity: 0,
            unitCostPen: product.purchasePrice,
          })),
        });
        await tx
          .update(productVariantTable)
          .set({ purchasePrice, updatedBy: userId })
          .where(eq(productVariantTable.id, variant.id));
      }
    }
    await tx.insert(stockMovementTable).values(
      products.map((product) => ({
        productVariantId: product.productVariantId,
        orderId,
        type: product.type,
        quantity: product.quantity,
        fromBucket: product.type === 'SALE' ? ('AVAILABLE' as const) : null,
        toBucket: product.type === 'RETURN' ? byItem.get(product.id) : null,
        unitCostPen: product.purchasePrice,
        createdBy: userId,
      })),
    );
  };
}
