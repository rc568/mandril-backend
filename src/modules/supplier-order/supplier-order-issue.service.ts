import { and, asc, eq } from 'drizzle-orm';
import {
  db,
  supplierOrderIssueTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import {
  closeSupplierOrderIssueSchema,
  createSupplierOrderIssueSchema,
  type SupplierOrderIssueCloseDto,
  type SupplierOrderIssueCreateDto,
} from './schemas/supplier-order-issue.schema';

export class SupplierOrderIssueService {
  private lockOrder = async (orderId: string, tx: Transaction) => {
    const [order] = await tx.select().from(supplierOrderTable).where(eq(supplierOrderTable.id, orderId)).for('update');
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    return order;
  };

  getAll = async (orderId: string) => {
    const order = await db.query.supplierOrderTable.findFirst({
      columns: { id: true },
      where: eq(supplierOrderTable.id, orderId),
    });
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    return db
      .select()
      .from(supplierOrderIssueTable)
      .where(eq(supplierOrderIssueTable.supplierOrderId, orderId))
      .orderBy(asc(supplierOrderIssueTable.createdAt), asc(supplierOrderIssueTable.id));
  };

  create = async (orderId: string, dto: SupplierOrderIssueCreateDto, userId: string) => {
    const input = createSupplierOrderIssueSchema.parse(dto);
    return db.transaction(async (tx) => {
      // Serialize claims with other claims and receipt reviews for the same purchase.
      const order = await this.lockOrder(orderId, tx);
      if (order.recordOrigin !== 'SYSTEM' || !['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status)) {
        throw CustomError.conflict(errorMessages.supplierOrder.issueOrderUnavailable);
      }
      if (input.type !== 'DEFECTIVE' && (order.status !== 'RECEIVED' || order.reviewStatus !== 'COMPLETED')) {
        throw CustomError.conflict(errorMessages.supplierOrder.issueReviewRequired);
      }
      const line = input.supplierOrderProductId
        ? await tx.query.supplierOrderProductTable.findFirst({
            where: and(
              eq(supplierOrderProductTable.id, input.supplierOrderProductId),
              eq(supplierOrderProductTable.supplierOrderId, orderId),
            ),
          })
        : undefined;
      if (input.supplierOrderProductId && !line)
        throw CustomError.badRequest(errorMessages.supplierOrder.productNotInOrder);

      const received = await tx
        .select({ item: supplierOrderReceiptItemTable, reviewStatus: supplierOrderReceiptTable.reviewStatus })
        .from(supplierOrderReceiptItemTable)
        .innerJoin(supplierOrderReceiptTable, eq(supplierOrderReceiptItemTable.receiptId, supplierOrderReceiptTable.id))
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId));
      const selected = received.find(({ item }) => item.id === input.receiptItemId);
      if (input.receiptItemId && (!selected || selected.reviewStatus !== 'COMPLETED')) {
        throw CustomError.badRequest(errorMessages.supplierOrder.issueItemUnavailable);
      }
      const item = selected?.item;
      if (input.type === 'DEFECTIVE' && line && item?.supplierOrderProductId !== line.id) {
        throw CustomError.badRequest(errorMessages.supplierOrder.issueLineMismatch);
      }
      if (
        input.type === 'WRONG_PRODUCT' &&
        item &&
        line &&
        (item.productVariantId === line.productVariantId ||
          item.supplierOrderProductId !== null ||
          item.sourceIssueId !== null)
      ) {
        throw CustomError.badRequest(errorMessages.supplierOrder.issueWrongProductRequired);
      }

      // Closed claims still consume affected units; closing a claim must not allow a duplicate claim.
      const issues = await tx
        .select()
        .from(supplierOrderIssueTable)
        .where(eq(supplierOrderIssueTable.supplierOrderId, orderId));
      const requested = BigInt(input.quantity);
      if (input.type !== 'DEFECTIVE' && line) {
        const receivedQuantity = received
          .filter(({ item }) => item.supplierOrderProductId === line.id)
          .reduce((total, { item }) => total + BigInt(item.availableQuantity) + BigInt(item.defectiveQuantity), 0n);
        const claimed = issues
          .filter((issue) => issue.supplierOrderProductId === line.id && issue.type !== 'DEFECTIVE')
          .reduce((total, issue) => total + BigInt(issue.quantity), 0n);
        if (requested + claimed + receivedQuantity > BigInt(line.quantityOrdered)) {
          throw CustomError.conflict(errorMessages.supplierOrder.issueQuantityExceeded);
        }
      }
      if (item) {
        const itemIssues = issues.filter((issue) => issue.receiptItemId === item.id);
        const claimed = itemIssues.reduce((total, issue) => total + BigInt(issue.quantity), 0n);
        const defectiveClaimed = itemIssues
          .filter((issue) => issue.type === 'DEFECTIVE')
          .reduce((total, issue) => total + BigInt(issue.quantity), 0n);
        // Separate issues may describe different units, but cannot claim the same physical units twice.
        if (
          requested + claimed > BigInt(item.availableQuantity) + BigInt(item.defectiveQuantity) ||
          (input.type === 'DEFECTIVE' && requested + defectiveClaimed > BigInt(item.defectiveQuantity))
        ) {
          throw CustomError.conflict(errorMessages.supplierOrder.issueQuantityExceeded);
        }
      }
      const [issue] = await tx
        .insert(supplierOrderIssueTable)
        .values({
          supplierOrderId: orderId,
          supplierOrderProductId: input.type === 'DEFECTIVE' ? item?.supplierOrderProductId : line?.id,
          receiptItemId: item?.id,
          type: input.type,
          quantity: input.quantity,
          description: input.description,
          createdBy: userId,
        })
        .returning();
      return issue;
    });
  };

  close = async (orderId: string, issueId: string, dto: SupplierOrderIssueCloseDto, userId: string) => {
    const input = closeSupplierOrderIssueSchema.parse(dto);
    return db.transaction(async (tx) => {
      await this.lockOrder(orderId, tx);
      // Receipt reviews lock this same issue before allocating compensations.
      const [issue] = await tx
        .select()
        .from(supplierOrderIssueTable)
        .where(and(eq(supplierOrderIssueTable.id, issueId), eq(supplierOrderIssueTable.supplierOrderId, orderId)))
        .for('update');
      if (!issue) throw CustomError.notFound(errorMessages.supplierOrder.issueNotFound);
      if (issue.status !== 'OPEN') throw CustomError.conflict(errorMessages.supplierOrder.issueAlreadyClosed);
      const [closed] = await tx
        .update(supplierOrderIssueTable)
        .set({
          status: 'CLOSED',
          resolutionNote: input.resolutionNote,
          closedAt: new Date(),
          closedBy: userId,
          updatedBy: userId,
        })
        .where(eq(supplierOrderIssueTable.id, issueId))
        .returning();
      return closed;
    });
  };
}
