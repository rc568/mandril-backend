import { and, asc, desc, eq, exists, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { InventoryService } from '@/modules/inventory';
import {
  db,
  productTable,
  productVariantTable,
  stockMovementTable,
  supplierOrderExpenseTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import type {
  SupplierOrderReceiptCreateDto,
  SupplierOrderReceiptItemDto,
  SupplierOrderReceiptUpdateDto,
} from './schemas/supplier-order-receipt.schema';
import { SupplierOrderCostService } from './supplier-order-cost.service';
import { SupplierOrderReceiptReviewService } from './supplier-order-receipt-review.service';

export class SupplierOrderReceiptService {
  private lockOrder = async (orderId: string, tx: Transaction) => {
    const [order] = await tx.select().from(supplierOrderTable).where(eq(supplierOrderTable.id, orderId)).for('update');
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    return order;
  };

  private saveItems = async (
    orderId: string,
    receiptId: string,
    itemsDto: SupplierOrderReceiptItemDto[],
    observation: string | null | undefined,
    tx: Transaction,
    excludeReceiptId?: string,
  ) => {
    const order = await tx.query.supplierOrderTable.findFirst({ where: eq(supplierOrderTable.id, orderId) });
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    const lines = await tx
      .select()
      .from(supplierOrderProductTable)
      .where(eq(supplierOrderProductTable.supplierOrderId, orderId));
    const items = itemsDto.map((item) => {
      const line = item.supplierOrderProductId
        ? lines.find((entry) => entry.id === item.supplierOrderProductId)
        : undefined;
      if (item.supplierOrderProductId && !line)
        throw CustomError.badRequest(errorMessages.supplierOrder.productNotInOrder);
      if (line && item.productVariantId !== undefined && item.productVariantId !== line.productVariantId)
        throw CustomError.badRequest(errorMessages.supplierOrder.receiptVariantMismatch);
      const variantId = line?.productVariantId ?? item.productVariantId;
      if (variantId === undefined) throw CustomError.badRequest(errorMessages.supplierOrder.receiptVariantRequired);
      if ((line?.type === 'COMPENSATION' && !item.sourceIssueId) || (line?.type === 'PURCHASE' && item.sourceIssueId))
        throw CustomError.badRequest(errorMessages.supplierOrder.receiptCompensationReference);
      if (!line && !item.sourceIssueId && !(item.observation || observation || order.observation))
        throw CustomError.badRequest(errorMessages.supplierOrder.unplannedReceiptObservationRequired);
      return {
        receiptId,
        supplierOrderProductId: line?.id ?? null,
        productVariantId: variantId,
        availableQuantity: item.availableQuantity,
        defectiveQuantity: item.defectiveQuantity,
        sourceIssueId: item.sourceIssueId ?? null,
        observation: item.observation,
        unplannedUnitCostPen: !line && !item.sourceIssueId ? '0.000000' : null,
      };
    });
    const variantIds = [...new Set(items.map((item) => item.productVariantId))];
    const variants = await tx
      .select({ id: productVariantTable.id })
      .from(productVariantTable)
      .innerJoin(productTable, eq(productVariantTable.productId, productTable.id))
      .where(
        and(
          inArray(productVariantTable.id, variantIds),
          isNull(productVariantTable.deletedAt),
          isNull(productTable.deletedAt),
        ),
      );
    if (variants.length !== variantIds.length)
      throw CustomError.notFound(errorMessages.supplierOrder.variantUnavailable);
    const prior = await tx
      .select({
        lineId: supplierOrderReceiptItemTable.supplierOrderProductId,
        quantity: sql<string>`sum(${supplierOrderReceiptItemTable.availableQuantity}::bigint + ${supplierOrderReceiptItemTable.defectiveQuantity}::bigint)::text`,
      })
      .from(supplierOrderReceiptItemTable)
      .innerJoin(supplierOrderReceiptTable, eq(supplierOrderReceiptItemTable.receiptId, supplierOrderReceiptTable.id))
      .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId))
      .groupBy(supplierOrderReceiptItemTable.supplierOrderProductId);
    for (const line of lines) {
      const old = BigInt(prior.find((entry) => entry.lineId === line.id)?.quantity ?? '0');
      const removed = excludeReceiptId
        ? await tx
            .select({
              quantity: sql<string>`coalesce(sum(${supplierOrderReceiptItemTable.availableQuantity}::bigint + ${supplierOrderReceiptItemTable.defectiveQuantity}::bigint),0)::text`,
            })
            .from(supplierOrderReceiptItemTable)
            .where(
              and(
                eq(supplierOrderReceiptItemTable.receiptId, excludeReceiptId),
                eq(supplierOrderReceiptItemTable.supplierOrderProductId, line.id),
              ),
            )
        : [];
      const candidate = items
        .filter((item) => item.supplierOrderProductId === line.id)
        .reduce((sum, item) => sum + BigInt(item.availableQuantity) + BigInt(item.defectiveQuantity), 0n);
      if (old - BigInt(removed[0]?.quantity ?? '0') + candidate > BigInt(line.quantityOrdered))
        throw CustomError.conflict(errorMessages.supplierOrder.receiptQuantityExceeded);
    }
    await new SupplierOrderReceiptReviewService().validateCompensations(order, items, tx);
    const saved = await tx.insert(supplierOrderReceiptItemTable).values(items).returning();
    return saved;
  };

  getAll = async (orderId: string) => {
    const order = await db.query.supplierOrderTable.findFirst({
      columns: { id: true },
      where: eq(supplierOrderTable.id, orderId),
    });
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    return db
      .select({
        ...getTableColumns(supplierOrderReceiptTable),
        // Posting is atomic for the whole package, so its movements are the source of truth.
        inventoryPosted: exists(
          db
            .select({ id: stockMovementTable.id })
            .from(stockMovementTable)
            .innerJoin(
              supplierOrderReceiptItemTable,
              eq(stockMovementTable.supplierOrderReceiptItemId, supplierOrderReceiptItemTable.id),
            )
            .where(eq(supplierOrderReceiptItemTable.receiptId, supplierOrderReceiptTable.id)),
        ).mapWith(Boolean),
      })
      .from(supplierOrderReceiptTable)
      .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId))
      .orderBy(asc(supplierOrderReceiptTable.sequenceNumber));
  };

  postToInventory = async (orderId: string, receiptId: string, userId: string) => {
    return db.transaction(async (tx) => {
      // Resolve stored costs on the server and keep their locks until the inventory entry commits.
      const costs = await new SupplierOrderCostService().resolveReceiptCosts(orderId, receiptId, tx);
      return new InventoryService().postPurchaseReceipt(orderId, receiptId, costs, userId, tx);
    });
  };

  getById = async (orderId: string, receiptId: string) => {
    const receipts = await this.getAll(orderId);
    const receipt = receipts.find((receipt) => receipt.id === receiptId);
    if (!receipt) throw CustomError.notFound(errorMessages.inventory.receiptNotFound);
    const items = await db
      .select()
      .from(supplierOrderReceiptItemTable)
      .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId))
      .orderBy(asc(supplierOrderReceiptItemTable.id));
    return { ...receipt, items };
  };

  create = async (orderId: string, dto: SupplierOrderReceiptCreateDto, userId: string) => {
    return db.transaction(async (tx) => {
      const order = await this.lockOrder(orderId, tx);
      if (order.recordOrigin !== 'SYSTEM') {
        throw CustomError.conflict(errorMessages.supplierOrder.legacySupplierOrder);
      }
      if (order.status === 'RECEIVED') {
        throw CustomError.conflict(errorMessages.supplierOrder.receivingNotOpen);
      }
      if (order.status === 'CANCELLED') {
        throw CustomError.conflict(errorMessages.supplierOrder.orderCancelled);
      }

      // The parent lock serializes allocation within this purchase, including its first receipt.
      const [lastReceipt] = await tx
        .select({ sequenceNumber: supplierOrderReceiptTable.sequenceNumber })
        .from(supplierOrderReceiptTable)
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId))
        .orderBy(desc(supplierOrderReceiptTable.sequenceNumber))
        .limit(1);
      const sequenceNumber = (lastReceipt?.sequenceNumber ?? 0) + 1;
      if (sequenceNumber > 2147483647) throw CustomError.conflict(errorMessages.supplierOrder.receiptSequenceExhausted);

      if (order.status !== 'PARTIALLY_RECEIVED') {
        // Expenses become immutable on first arrival. Require the equivalent used by the cost formula now.
        // The projected exchange rate may still be defined after review.
        const expenses = await tx
          .select()
          .from(supplierOrderExpenseTable)
          .where(eq(supplierOrderExpenseTable.supplierOrderId, orderId));
        if (
          order.currency === null ||
          order.supplierPaymentAmount === null ||
          expenses.some((expense) => (order.currency === 'USD' ? expense.amountUsd : expense.amountPen) === null)
        ) {
          throw CustomError.conflict(errorMessages.supplierOrder.receiptExpenseCurrencyRequired);
        }
      }
      const [receipt] = await tx
        .insert(supplierOrderReceiptTable)
        .values({
          supplierOrderId: orderId,
          sequenceNumber,
          receivedAt: dto.receivedAt ?? new Date(),
          receivedBy: userId,
          observation: dto.observation,
          createdBy: userId,
        })
        .returning();
      const items = await this.saveItems(orderId, receipt.id, dto.items, dto.observation, tx);
      await tx
        .update(supplierOrderTable)
        .set({
          status: 'PARTIALLY_RECEIVED',
          // A newly arrived package is pending review even if earlier packages were already reviewed.
          reviewStatus: order.reviewStatus === 'PENDING' ? 'PENDING' : 'IN_PROGRESS',
          updatedBy: userId,
        })
        .where(eq(supplierOrderTable.id, orderId));
      return { ...receipt, items };
    });
  };

  update = async (orderId: string, receiptId: string, dto: SupplierOrderReceiptUpdateDto, userId: string) =>
    db.transaction(async (tx) => {
      await this.lockOrder(orderId, tx);
      const [receipt] = await tx
        .select()
        .from(supplierOrderReceiptTable)
        .where(and(eq(supplierOrderReceiptTable.id, receiptId), eq(supplierOrderReceiptTable.supplierOrderId, orderId)))
        .for('update');
      if (!receipt) throw CustomError.notFound(errorMessages.inventory.receiptNotFound);
      if (receipt.reviewStatus !== 'PENDING')
        throw CustomError.conflict(errorMessages.supplierOrder.receiptAlreadyReviewed);
      if (dto.items) {
        const [movement] = await tx
          .select({ id: stockMovementTable.id })
          .from(stockMovementTable)
          .innerJoin(
            supplierOrderReceiptItemTable,
            eq(stockMovementTable.supplierOrderReceiptItemId, supplierOrderReceiptItemTable.id),
          )
          .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId))
          .limit(1);
        if (movement) throw CustomError.conflict(errorMessages.inventory.receiptAlreadyPosted);
        await tx.delete(supplierOrderReceiptItemTable).where(eq(supplierOrderReceiptItemTable.receiptId, receiptId));
        await this.saveItems(orderId, receiptId, dto.items, dto.observation ?? receipt.observation, tx, receiptId);
      }
      const [updated] = await tx
        .update(supplierOrderReceiptTable)
        .set({
          receivedAt: dto.receivedAt ?? receipt.receivedAt,
          observation: dto.observation === undefined ? receipt.observation : dto.observation,
          updatedBy: userId,
        })
        .where(eq(supplierOrderReceiptTable.id, receiptId))
        .returning();
      return {
        ...updated,
        items: await tx
          .select()
          .from(supplierOrderReceiptItemTable)
          .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId)),
      };
    });

  delete = async (orderId: string, receiptId: string, userId: string) =>
    db.transaction(async (tx) => {
      const order = await this.lockOrder(orderId, tx);
      const [receipt] = await tx
        .select()
        .from(supplierOrderReceiptTable)
        .where(and(eq(supplierOrderReceiptTable.id, receiptId), eq(supplierOrderReceiptTable.supplierOrderId, orderId)))
        .for('update');
      if (!receipt) throw CustomError.notFound(errorMessages.inventory.receiptNotFound);
      if (receipt.reviewStatus !== 'PENDING')
        throw CustomError.conflict(errorMessages.supplierOrder.receiptAlreadyReviewed);
      const itemIds = (
        await tx
          .select({ id: supplierOrderReceiptItemTable.id })
          .from(supplierOrderReceiptItemTable)
          .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId))
      ).map((item) => item.id);
      if (itemIds.length) {
        const [movement] = await tx
          .select({ id: stockMovementTable.id })
          .from(stockMovementTable)
          .where(inArray(stockMovementTable.supplierOrderReceiptItemId, itemIds))
          .limit(1);
        if (movement) throw CustomError.conflict(errorMessages.inventory.receiptAlreadyPosted);
        await tx.delete(supplierOrderReceiptItemTable).where(inArray(supplierOrderReceiptItemTable.id, itemIds));
      }
      await tx.delete(supplierOrderReceiptTable).where(eq(supplierOrderReceiptTable.id, receiptId));
      const statuses = await tx
        .select({ reviewStatus: supplierOrderReceiptTable.reviewStatus })
        .from(supplierOrderReceiptTable)
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId));
      await tx
        .update(supplierOrderTable)
        .set({
          reviewStatus:
            statuses.length && statuses.every((r) => r.reviewStatus === 'COMPLETED')
              ? 'COMPLETED'
              : statuses.some((r) => r.reviewStatus === 'COMPLETED')
                ? 'IN_PROGRESS'
                : 'PENDING',
          updatedBy: userId,
        })
        .where(eq(supplierOrderTable.id, order.id));
      return { receiptId, deleted: true };
    });

  closeReceiving = async (orderId: string, userId: string) => {
    return db.transaction(async (tx) => {
      const order = await this.lockOrder(orderId, tx);
      if (order.recordOrigin !== 'SYSTEM') {
        throw CustomError.conflict(errorMessages.supplierOrder.legacySupplierOrder);
      }
      if (order.status === 'RECEIVED') {
        throw CustomError.conflict(errorMessages.supplierOrder.orderAlreadyClose);
      }
      if (order.status === 'CANCELLED') {
        throw CustomError.conflict(errorMessages.supplierOrder.orderCancelled);
      }
      if (order.status !== 'PARTIALLY_RECEIVED') {
        throw CustomError.conflict(errorMessages.supplierOrder.receivingCannotClose);
      }

      const receipts = await tx
        .select({ reviewStatus: supplierOrderReceiptTable.reviewStatus })
        .from(supplierOrderReceiptTable)
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId));
      if (receipts.length === 0) throw CustomError.conflict(errorMessages.supplierOrder.receivingMissingReceipts);
      const completed = receipts.filter((receipt) => receipt.reviewStatus === 'COMPLETED').length;
      if (completed !== receipts.length) throw CustomError.conflict(errorMessages.supplierOrder.receiptsPendingReview);

      const [closed] = await tx
        .update(supplierOrderTable)
        .set({
          status: 'RECEIVED',
          receivingClosedAt: new Date(),
          receivingClosedBy: userId,
          updatedBy: userId,
          reviewStatus: completed === receipts.length ? 'COMPLETED' : completed > 0 ? 'IN_PROGRESS' : 'PENDING',
        })
        .where(eq(supplierOrderTable.id, orderId))
        .returning();

      return closed;
    });
  };
}
