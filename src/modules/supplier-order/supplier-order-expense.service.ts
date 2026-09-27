import { and, eq } from 'drizzle-orm';
import { db, supplierOrderExpenseTable, supplierOrderTable, type Transaction } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import type {
  SupplierOrderExpenseCreateDto,
  SupplierOrderExpenseUpdateDto,
} from './schemas/supplier-order-expense.schema';

export class SupplierOrderExpenseService {
  private lockEditableOrder = async (orderId: string, tx: Transaction) => {
    // Use the same parent lock as purchase edits and state transitions.
    const [order] = await tx
      .select({ status: supplierOrderTable.status })
      .from(supplierOrderTable)
      .where(eq(supplierOrderTable.id, orderId))
      .for('update');
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    if (order.status !== 'PREPARING' && order.status !== 'IN_TRANSIT') {
      throw CustomError.conflict(errorMessages.supplierOrder.notEditable);
    }
  };

  private validateExpense = (
    expense: Pick<SupplierOrderExpenseCreateDto, 'type' | 'description' | 'amountUsd' | 'amountPen'>,
  ) => {
    if (expense.amountUsd == null && expense.amountPen == null) {
      throw CustomError.badRequest(errorMessages.supplierOrder.expenseAmountRequired);
    }
    if (expense.type === 'OTHER' && !expense.description?.trim()) {
      throw CustomError.badRequest(errorMessages.supplierOrder.expenseDescriptionRequired);
    }
  };

  private updateOrderAudit = async (orderId: string, userId: string, tx: Transaction) => {
    await tx.update(supplierOrderTable).set({ updatedBy: userId }).where(eq(supplierOrderTable.id, orderId));
  };

  create = async (orderId: string, dto: SupplierOrderExpenseCreateDto, userId: string) => {
    return db.transaction(async (tx) => {
      await this.lockEditableOrder(orderId, tx);
      this.validateExpense(dto);
      const [expense] = await tx
        .insert(supplierOrderExpenseTable)
        .values({ ...dto, supplierOrderId: orderId, createdBy: userId })
        .returning();
      await this.updateOrderAudit(orderId, userId, tx);
      return expense;
    });
  };

  update = async (orderId: string, expenseId: string, dto: SupplierOrderExpenseUpdateDto, userId: string) => {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw CustomError.badRequest(errorMessages.common.bodyEmpty);
    }
    return db.transaction(async (tx) => {
      await this.lockEditableOrder(orderId, tx);
      const condition = and(
        eq(supplierOrderExpenseTable.id, expenseId),
        eq(supplierOrderExpenseTable.supplierOrderId, orderId),
      );
      const [expense] = await tx.select().from(supplierOrderExpenseTable).where(condition);
      if (!expense) throw CustomError.notFound(errorMessages.supplierOrder.expenseNotFound);
      // Undefined preserves the stored value; null explicitly clears it.
      this.validateExpense({
        type: dto.type ?? expense.type,
        description: dto.description === undefined ? expense.description : dto.description,
        amountUsd: dto.amountUsd === undefined ? expense.amountUsd : dto.amountUsd,
        amountPen: dto.amountPen === undefined ? expense.amountPen : dto.amountPen,
      });
      const [updated] = await tx
        .update(supplierOrderExpenseTable)
        .set({ ...dto, updatedBy: userId })
        .where(condition)
        .returning();
      await this.updateOrderAudit(orderId, userId, tx);
      return updated;
    });
  };

  delete = async (orderId: string, expenseId: string, userId: string) => {
    return db.transaction(async (tx) => {
      await this.lockEditableOrder(orderId, tx);
      const [expense] = await tx
        .delete(supplierOrderExpenseTable)
        .where(and(eq(supplierOrderExpenseTable.id, expenseId), eq(supplierOrderExpenseTable.supplierOrderId, orderId)))
        .returning();
      if (!expense) throw CustomError.notFound(errorMessages.supplierOrder.expenseNotFound);
      await this.updateOrderAudit(orderId, userId, tx);
      return expense;
    });
  };
}
