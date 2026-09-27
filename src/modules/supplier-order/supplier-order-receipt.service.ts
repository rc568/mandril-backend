import { asc, desc, eq } from 'drizzle-orm';
import {
  db,
  supplierOrderExpenseTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import type { SupplierOrderReceiptCreateDto } from './schemas/supplier-order-receipt.schema';

export class SupplierOrderReceiptService {
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
      .from(supplierOrderReceiptTable)
      .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId))
      .orderBy(asc(supplierOrderReceiptTable.sequenceNumber));
  };

  create = async (orderId: string, dto: SupplierOrderReceiptCreateDto, userId: string) => {
    return db.transaction(async (tx) => {
      const order = await this.lockOrder(orderId, tx);
      if (
        order.recordOrigin !== 'SYSTEM' ||
        !['PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(order.status)
      ) {
        throw CustomError.conflict(errorMessages.supplierOrder.receivingNotOpen);
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
      await tx
        .update(supplierOrderTable)
        .set({
          status: 'PARTIALLY_RECEIVED',
          // A newly arrived package is pending review even if earlier packages were already reviewed.
          reviewStatus: order.reviewStatus === 'PENDING' ? 'PENDING' : 'IN_PROGRESS',
          updatedBy: userId,
        })
        .where(eq(supplierOrderTable.id, orderId));
      return receipt;
    });
  };

  closeReceiving = async (orderId: string, userId: string) => {
    return db.transaction(async (tx) => {
      const order = await this.lockOrder(orderId, tx);
      if (order.recordOrigin !== 'SYSTEM' || order.status !== 'PARTIALLY_RECEIVED') {
        throw CustomError.conflict(errorMessages.supplierOrder.receivingCannotClose);
      }
      const receipts = await tx
        .select({ reviewStatus: supplierOrderReceiptTable.reviewStatus })
        .from(supplierOrderReceiptTable)
        .where(eq(supplierOrderReceiptTable.supplierOrderId, orderId));
      if (receipts.length === 0) throw CustomError.conflict(errorMessages.supplierOrder.receivingCannotClose);
      const completed = receipts.filter((receipt) => receipt.reviewStatus === 'COMPLETED').length;
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
