import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  db,
  productTable,
  productVariantTable,
  supplierOrderIssueTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import type { SupplierOrderReceiptReviewDto } from './schemas/supplier-order-receipt.schema';

type ReceiptItemInsert = typeof supplierOrderReceiptItemTable.$inferInsert;

export class SupplierOrderReceiptReviewService {
  private validateCompensations = async (
    order: typeof supplierOrderTable.$inferSelect,
    items: ReceiptItemInsert[],
    tx: Transaction,
  ) => {
    const issueIds = [...new Set(items.flatMap((item) => (item.sourceIssueId ? [item.sourceIssueId] : [])))].sort();
    if (issueIds.length === 0) return;
    // Serialize allocations even when different purchases compensate the same issue.
    const issues = await tx
      .select()
      .from(supplierOrderIssueTable)
      .where(inArray(supplierOrderIssueTable.id, issueIds))
      .orderBy(asc(supplierOrderIssueTable.id))
      .for('update');
    if (issues.length !== issueIds.length)
      throw CustomError.notFound(errorMessages.supplierOrder.compensationIssueUnavailable);
    for (const issue of issues) {
      const sourceOrder = await tx.query.supplierOrderTable.findFirst({
        where: eq(supplierOrderTable.id, issue.supplierOrderId),
      });
      if (
        issue.status !== 'OPEN' ||
        issue.supplierOrderId === order.id ||
        sourceOrder?.supplierId !== order.supplierId
      ) {
        throw CustomError.conflict(errorMessages.supplierOrder.compensationIssueUnavailable);
      }
      // Wrong-product issues identify the requested variant through the original order line.
      const sourceLine = issue.supplierOrderProductId
        ? await tx.query.supplierOrderProductTable.findFirst({
            where: eq(supplierOrderProductTable.id, issue.supplierOrderProductId),
          })
        : undefined;
      const sourceItem = issue.receiptItemId
        ? await tx.query.supplierOrderReceiptItemTable.findFirst({
            where: eq(supplierOrderReceiptItemTable.id, issue.receiptItemId),
          })
        : undefined;
      const expectedVariant = issue.type === 'DEFECTIVE' ? sourceItem?.productVariantId : sourceLine?.productVariantId;
      const compensations = items.filter((item) => item.sourceIssueId === issue.id);
      if (!expectedVariant || compensations.some((item) => item.productVariantId !== expectedVariant)) {
        throw CustomError.conflict(errorMessages.supplierOrder.compensationVariantMismatch);
      }
      const [prior] = await tx
        .select({
          quantity: sql<string>`coalesce(sum(${supplierOrderReceiptItemTable.availableQuantity}::bigint + ${supplierOrderReceiptItemTable.defectiveQuantity}::bigint), 0)::text`,
        })
        .from(supplierOrderReceiptItemTable)
        .where(eq(supplierOrderReceiptItemTable.sourceIssueId, issue.id));
      const received = compensations.reduce(
        (sum, item) => sum + BigInt(item.availableQuantity ?? 0) + BigInt(item.defectiveQuantity ?? 0),
        0n,
      );
      if (BigInt(prior.quantity) + received > BigInt(issue.quantity)) {
        throw CustomError.conflict(errorMessages.supplierOrder.compensationQuantityExceeded);
      }
    }
  };

  review = async (orderId: string, receiptId: string, dto: SupplierOrderReceiptReviewDto, userId: string) => {
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(supplierOrderTable)
        .where(eq(supplierOrderTable.id, orderId))
        .for('update');
      if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
      if (order.recordOrigin !== 'SYSTEM' || !['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status)) {
        throw CustomError.conflict(errorMessages.supplierOrder.receiptCannotReview);
      }
      const [receipt] = await tx
        .select()
        .from(supplierOrderReceiptTable)
        .where(and(eq(supplierOrderReceiptTable.id, receiptId), eq(supplierOrderReceiptTable.supplierOrderId, orderId)))
        .for('update');
      if (!receipt) throw CustomError.notFound(errorMessages.inventory.receiptNotFound);
      if (receipt.reviewStatus !== 'PENDING')
        throw CustomError.conflict(errorMessages.supplierOrder.receiptAlreadyReviewed);
      const [existing] = await tx
        .select({ id: supplierOrderReceiptItemTable.id })
        .from(supplierOrderReceiptItemTable)
        .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId))
        .limit(1);
      if (existing) throw CustomError.conflict(errorMessages.supplierOrder.receiptAlreadyReviewed);
      if (dto.items.length === 0) throw CustomError.badRequest(errorMessages.supplierOrder.receiptItemsRequired);

      const lines = await tx
        .select()
        .from(supplierOrderProductTable)
        .where(eq(supplierOrderProductTable.supplierOrderId, orderId));
      const items: ReceiptItemInsert[] = dto.items.map((item) => {
        const line = item.supplierOrderProductId
          ? lines.find((line) => line.id === item.supplierOrderProductId)
          : undefined;
        if (item.supplierOrderProductId && !line)
          throw CustomError.badRequest(errorMessages.supplierOrder.productNotInOrder);
        if (line && item.productVariantId !== undefined && item.productVariantId !== line.productVariantId) {
          throw CustomError.badRequest(errorMessages.supplierOrder.receiptVariantMismatch);
        }
        const variantId = line?.productVariantId ?? item.productVariantId;
        if (variantId === undefined) throw CustomError.badRequest(errorMessages.supplierOrder.receiptVariantRequired);
        if (
          (line?.type === 'COMPENSATION' && !item.sourceIssueId) ||
          (line?.type === 'PURCHASE' && item.sourceIssueId)
        ) {
          throw CustomError.badRequest(errorMessages.supplierOrder.receiptCompensationReference);
        }
        const receiptObservation = dto.observation === undefined ? receipt.observation : dto.observation;
        if (!line && !item.sourceIssueId && !(item.observation || receiptObservation || order.observation)) {
          throw CustomError.badRequest(errorMessages.supplierOrder.unplannedReceiptObservationRequired);
        }
        return {
          receiptId,
          supplierOrderProductId: line?.id ?? null,
          productVariantId: variantId,
          availableQuantity: item.availableQuantity,
          defectiveQuantity: item.defectiveQuantity,
          sourceIssueId: item.sourceIssueId ?? null,
          observation: item.observation,
          // Compensation cost is resolved later from its original issue; never substitute zero.
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
        )
        .orderBy(asc(productVariantTable.id))
        .for('share');
      if (variants.length !== variantIds.length)
        throw CustomError.notFound(errorMessages.supplierOrder.variantUnavailable);

      const priorItems = await tx
        .select({
          lineId: supplierOrderReceiptItemTable.supplierOrderProductId,
          quantity: sql<string>`sum(${supplierOrderReceiptItemTable.availableQuantity}::bigint + ${supplierOrderReceiptItemTable.defectiveQuantity}::bigint)::text`,
        })
        .from(supplierOrderReceiptItemTable)
        .innerJoin(supplierOrderReceiptTable, eq(supplierOrderReceiptItemTable.receiptId, supplierOrderReceiptTable.id))
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId))
        .groupBy(supplierOrderReceiptItemTable.supplierOrderProductId);
      for (const line of lines) {
        const added = items
          .filter((item) => item.supplierOrderProductId === line.id)
          .reduce((sum, item) => sum + BigInt(item.availableQuantity ?? 0) + BigInt(item.defectiveQuantity ?? 0), 0n);
        const prior = BigInt(priorItems.find((item) => item.lineId === line.id)?.quantity ?? '0');
        if (prior + added > BigInt(line.quantityOrdered)) {
          throw CustomError.conflict(errorMessages.supplierOrder.receiptQuantityExceeded);
        }
      }
      await this.validateCompensations(order, items, tx);
      const savedItems = await tx.insert(supplierOrderReceiptItemTable).values(items).returning();
      const [reviewed] = await tx
        .update(supplierOrderReceiptTable)
        .set({
          reviewStatus: 'COMPLETED',
          reviewedAt: new Date(),
          reviewedBy: userId,
          observation: dto.observation,
          updatedBy: userId,
        })
        .where(eq(supplierOrderReceiptTable.id, receiptId))
        .returning();
      const receipts = await tx
        .select({ reviewStatus: supplierOrderReceiptTable.reviewStatus })
        .from(supplierOrderReceiptTable)
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId));
      await tx
        .update(supplierOrderTable)
        .set({
          reviewStatus: receipts.every((receipt) => receipt.reviewStatus === 'COMPLETED') ? 'COMPLETED' : 'IN_PROGRESS',
          updatedBy: userId,
        })
        .where(eq(supplierOrderTable.id, orderId));
      return { ...reviewed, items: savedItems };
    });
  };
}
