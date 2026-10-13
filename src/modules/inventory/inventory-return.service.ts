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
import type { ReturnItemConditionDto } from './schemas/inventory.schema';
import { calculateWeightedPurchasePrice } from './utils/calculate-weighted-purchase-price';

export class InventoryReturnService {
  // Order Service checks return eligibility and commits the order status in this same transaction.
  complete = async (
    orderId: string,
    returnItemsDto: readonly ReturnItemConditionDto[],
    userId: string,
    tx: Transaction,
  ) => {
    const [orderDb] = await tx.select().from(orderTable).where(eq(orderTable.id, orderId)).for('update');
    if (
      !orderDb ||
      orderDb.status !== 'PENDING' ||
      !['RETURN', 'EXCHANGE'].includes(orderDb.type) ||
      orderDb.deletedAt !== null
    ) {
      throw CustomError.conflict(errorMessages.inventory.returnNotReady);
    }
    const orderProductsDb = await tx.select().from(orderProductTable).where(eq(orderProductTable.orderId, orderId));
    const returnOrderProductsDb = orderProductsDb.filter((product) => product.type === 'RETURN');
    const destinations = new Set(returnItemsDto.map((item) => `${item.orderProductId}:${item.condition}`));

    if (orderDb.type === 'RETURN' && orderProductsDb.some((product) => product.type !== 'RETURN')) {
      throw CustomError.badRequest(errorMessages.order.invalidProductsTypeForReturnOrder);
    }

    if (
      returnOrderProductsDb.length === 0 ||
      destinations.size !== returnItemsDto.length ||
      returnItemsDto.some((item) => !returnOrderProductsDb.some((product) => product.id === item.orderProductId))
    ) {
      throw CustomError.badRequest(errorMessages.inventory.returnConditionsRequired);
    }

    for (const product of returnOrderProductsDb) {
      const quantity = returnItemsDto
        .filter((item) => item.orderProductId === product.id)
        .reduce((sum, item) => sum + BigInt(item.quantity), 0n);
      if (quantity !== BigInt(product.quantity))
        throw CustomError.badRequest(errorMessages.inventory.returnConditionsRequired);
    }

    const postings = orderProductsDb.flatMap<
      (typeof orderProductsDb)[number] & { condition: ReturnItemConditionDto['condition'] | null }
    >((op) =>
      op.type === 'SALE'
        ? [{ ...op, condition: null }]
        : returnItemsDto
            .filter((item) => item.orderProductId === op.id)
            .map((item) => ({ ...op, quantity: item.quantity, condition: item.condition })),
    );

    const [posted] = await tx
      .select({ id: stockMovementTable.id })
      .from(stockMovementTable)
      .where(eq(stockMovementTable.orderId, orderId))
      .limit(1);
    if (posted) throw CustomError.conflict(errorMessages.inventory.orderAlreadyPosted);

    const variantIds = [...new Set(orderProductsDb.map((product) => product.productVariantId))].sort((a, b) => a - b);
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
      const lines = postings.filter((product) => product.productVariantId === variant.id);
      const sold = lines
        .filter((product) => product.type === 'SALE')
        .reduce((sum, product) => sum + BigInt(product.quantity), 0n);
      const availableAfterSale = BigInt(available?.quantity ?? 0) - sold;
      const returned = lines.filter((product) => product.type === 'RETURN');

      if (availableAfterSale < 0n) throw CustomError.conflict(errorMessages.order.outOfStock);

      for (const bucket of RETURN_CONDITION) {
        const added = returned
          .filter((product) => product.condition === bucket)
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

      const goodReturns = returned.filter((product) => product.condition === 'AVAILABLE');
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
      postings.map((product) => ({
        productVariantId: product.productVariantId,
        orderId,
        type: product.type,
        quantity: product.quantity,
        fromBucket: product.type === 'SALE' ? ('AVAILABLE' as const) : null,
        toBucket: product.condition,
        unitCostPen: product.purchasePrice,
        createdBy: userId,
      })),
    );
  };
}
