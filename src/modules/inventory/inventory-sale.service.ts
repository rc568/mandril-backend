import { asc, eq, inArray } from 'drizzle-orm';
import {
  db,
  inventoryBalanceTable,
  orderProductTable,
  orderTable,
  productVariantTable,
  stockMovementTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';

interface SaleReservationItem {
  productVariantId: number;
  quantity: number;
}

export class InventorySaleService {
  private lockSale = async (orderId: string, tx: Transaction) => {
    const [order] = await tx.select().from(orderTable).where(eq(orderTable.id, orderId)).for('update');
    if (!order) throw CustomError.notFound(errorMessages.order.notFound);
    if (order.type !== 'SALE' || !['PENDING', 'PAID'].includes(order.status) || order.deletedAt !== null) {
      throw CustomError.conflict(errorMessages.inventory.saleNotReservable);
    }
  };

  private getReservedQuantities = async (orderId: string, tx: Transaction) => {
    const movements = await tx.select().from(stockMovementTable).where(eq(stockMovementTable.orderId, orderId));
    const migratedSources = new Set(
      movements
        .filter((movement) => movement.legacyMovementId !== null)
        .filter((reservation) =>
          movements.some(
            (original) =>
              original.id === reservation.legacyMovementId &&
              original.type === 'SALE' &&
              original.fromBucket === null &&
              original.toBucket === null &&
              original.productVariantId === reservation.productVariantId &&
              original.quantity === reservation.quantity &&
              original.deletedAt === null &&
              reservation.type === 'RESERVATION',
          ),
        )
        .map((movement) => movement.legacyMovementId),
    );
    if (
      movements.some(
        (movement) =>
          !migratedSources.has(movement.id) && (movement.fromBucket === null || movement.deletedAt !== null),
      )
    ) {
      throw CustomError.conflict(errorMessages.inventory.legacySaleMovements);
    }
    const quantities = new Map<number, bigint>();
    for (const movement of movements) {
      const added = movement.toBucket === 'RESERVED' ? BigInt(movement.quantity) : 0n;
      const removed = movement.fromBucket === 'RESERVED' ? BigInt(movement.quantity) : 0n;
      quantities.set(movement.productVariantId, (quantities.get(movement.productVariantId) ?? 0n) + added - removed);
    }
    for (const [variantId, quantity] of quantities) {
      if (quantity < 0n) throw CustomError.conflict(errorMessages.inventory.reservationMismatch);
      if (quantity === 0n) quantities.delete(variantId);
    }
    return quantities;
  };

  private lockBalances = async (variantIds: number[], tx: Transaction) => {
    // Coordinate with purchase posting even when no balance rows exist yet.
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
      if (
        variant.quantityInStock !== 0 &&
        !balances.some((balance) => balance.productVariantId === variant.id && balance.bucket === 'AVAILABLE')
      ) {
        throw CustomError.conflict(errorMessages.inventory.balanceNotInitialized);
      }
    }
    return balances;
  };

  private saveBalance = async (
    productVariantId: number,
    bucket: 'AVAILABLE' | 'RESERVED',
    quantity: bigint,
    userId: string,
    tx: Transaction,
  ) => {
    if (quantity < 0n) throw CustomError.conflict(errorMessages.order.outOfStock);
    if (quantity > 2147483647n) throw CustomError.conflict(errorMessages.inventory.balanceOverflow);
    await tx
      .insert(inventoryBalanceTable)
      .values({ productVariantId, bucket, quantity: Number(quantity), updatedBy: userId })
      .onConflictDoUpdate({
        target: [inventoryBalanceTable.productVariantId, inventoryBalanceTable.bucket],
        set: { quantity: Number(quantity), updatedBy: userId },
      });
  };

  // Desired quantities replace this sale's reservation, not the reservations of other customers.
  // Order Service must persist its lines in the same transaction when integrating this operation.
  setReservation = async (
    orderId: string,
    items: readonly SaleReservationItem[],
    userId: string,
    tx?: Transaction,
  ): Promise<void> => {
    if (!tx) return db.transaction((transaction) => this.setReservation(orderId, items, userId, transaction));
    await this.lockSale(orderId, tx);
    const desired = new Map<number, bigint>();
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 2147483647) {
        throw CustomError.badRequest(errorMessages.inventory.invalidQuantity);
      }
      if (desired.has(item.productVariantId))
        throw CustomError.badRequest(errorMessages.inventory.duplicatedReservationVariant);
      desired.set(item.productVariantId, BigInt(item.quantity));
    }
    const reserved = await this.getReservedQuantities(orderId, tx);
    const ids = [...new Set([...desired.keys(), ...reserved.keys()])].sort((a, b) => a - b);
    const changedIds = ids.filter((id) => (desired.get(id) ?? 0n) !== (reserved.get(id) ?? 0n));
    if (changedIds.length === 0) return;
    const balances = await this.lockBalances(changedIds, tx);
    for (const id of changedIds) {
      const delta = (desired.get(id) ?? 0n) - (reserved.get(id) ?? 0n);
      const available = BigInt(
        balances.find((balance) => balance.productVariantId === id && balance.bucket === 'AVAILABLE')?.quantity ?? 0,
      );
      const totalReserved = BigInt(
        balances.find((balance) => balance.productVariantId === id && balance.bucket === 'RESERVED')?.quantity ?? 0,
      );
      await this.saveBalance(id, 'AVAILABLE', available - delta, userId, tx);
      await this.saveBalance(id, 'RESERVED', totalReserved + delta, userId, tx);
      await tx.insert(stockMovementTable).values({
        productVariantId: id,
        orderId,
        type: delta > 0n ? 'RESERVATION' : 'RESERVATION_RELEASE',
        fromBucket: delta > 0n ? 'AVAILABLE' : 'RESERVED',
        toBucket: delta > 0n ? 'RESERVED' : 'AVAILABLE',
        quantity: Number(delta > 0n ? delta : -delta),
        createdBy: userId,
      });
    }
  };

  releaseReservation = async (orderId: string, userId: string, tx?: Transaction) => {
    return this.setReservation(orderId, [], userId, tx);
  };

  deliverSale = async (orderId: string, userId: string, tx?: Transaction): Promise<void> => {
    if (!tx) return db.transaction((transaction) => this.deliverSale(orderId, userId, transaction));
    await this.lockSale(orderId, tx);
    const reserved = await this.getReservedQuantities(orderId, tx);
    const products = await tx.select().from(orderProductTable).where(eq(orderProductTable.orderId, orderId));
    if (
      products.length === 0 ||
      products.length !== reserved.size ||
      products.some(
        (product) => product.type !== 'SALE' || reserved.get(product.productVariantId) !== BigInt(product.quantity),
      )
    ) {
      throw CustomError.conflict(errorMessages.inventory.reservationMismatch);
    }
    const balances = await this.lockBalances(
      [...reserved.keys()].sort((a, b) => a - b),
      tx,
    );
    for (const product of products) {
      const totalReserved = BigInt(
        balances.find(
          (balance) => balance.productVariantId === product.productVariantId && balance.bucket === 'RESERVED',
        )?.quantity ?? 0,
      );
      await this.saveBalance(
        product.productVariantId,
        'RESERVED',
        totalReserved - BigInt(product.quantity),
        userId,
        tx,
      );
      await tx.insert(stockMovementTable).values({
        productVariantId: product.productVariantId,
        orderId,
        type: 'SALE',
        fromBucket: 'RESERVED',
        toBucket: null,
        quantity: product.quantity,
        unitCostPen: product.purchasePrice,
        createdBy: userId,
      });
    }
  };
}
