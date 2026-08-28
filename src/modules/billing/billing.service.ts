import { and, eq } from 'drizzle-orm';
import type { OrderService } from '@/modules/order';
import { billingOrdersTable, db, type Transaction } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { INVOICE_CODE_BOLETA_REGEX, INVOICE_CODE_FACTURA_REGEX } from './domain';
import type { BillingOrderCreateDto, BillingOrderUpdateDto, IssueBillingDto } from './schemas/billing.schema';

const returningColumns = {
  id: billingOrdersTable.id,
  code: billingOrdersTable.code,
  amount: billingOrdersTable.amount,
  status: billingOrdersTable.status,
  billingName: billingOrdersTable.billingName,
  billingReceiptType: billingOrdersTable.billingReceiptType,
  billingDocumentNumberType: billingOrdersTable.billingDocumentNumberType,
  billingDocumentNumber: billingOrdersTable.billingDocumentNumber,
};

export class BillingService {
  constructor(private readonly orderService: OrderService) {}

  private getBillingByIdForUpdate = async (billingId: string, tx: Transaction) => {
    const [billing] = await tx
      .select({ status: billingOrdersTable.status, billingReceiptType: billingOrdersTable.billingReceiptType })
      .from(billingOrdersTable)
      .where(eq(billingOrdersTable.id, billingId))
      .for('update');
    return billing;
  };
  private codeExists = async (code: string, tx?: Transaction): Promise<boolean> => {
    const executor = tx ?? db;

    const codeExists = await executor.query.billingOrdersTable.findFirst({
      where: eq(billingOrdersTable.code, code),
      columns: { orderId: true },
    });

    return !!codeExists;
  };
  create = async (orderId: string, billingCreateDto: BillingOrderCreateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.orderService.getById(orderId, tx);
      if (orderDb.status === 'PENDING' || orderDb.status === 'CANCELLED') {
        throw CustomError.conflict(errorMessages.billing.orderNotBillable);
      }

      const existingPending = await tx.query.billingOrdersTable.findFirst({
        where: and(eq(billingOrdersTable.orderId, orderId), eq(billingOrdersTable.status, 'PENDING')),
      });
      if (existingPending) throw CustomError.conflict(errorMessages.billing.pendingBillingExists);

      if (billingCreateDto.code) {
        const codeExists = await this.codeExists(billingCreateDto.code, tx);
        if (codeExists) throw CustomError.conflict(errorMessages.billing.duplicatedReceiptCode);
      }

      const [insertedBillingOrder] = await tx
        .insert(billingOrdersTable)
        .values({ ...billingCreateDto, orderId: orderId, createdBy: userId })
        .returning(returningColumns);

      return insertedBillingOrder;
    });
  };

  update = async (billingId: string, billingUpdateDto: BillingOrderUpdateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const billingOrderDb = await this.getBillingByIdForUpdate(billingId, tx);
      if (!billingOrderDb) throw CustomError.notFound(errorMessages.billing.notFound);

      if (billingOrderDb.status !== 'PENDING')
        throw CustomError.conflict(errorMessages.billing.cannotUpdateNotPendingBill);

      const [updatedBillingOrder] = await tx
        .update(billingOrdersTable)
        .set({ ...billingUpdateDto, updatedBy: userId })
        .where(eq(billingOrdersTable.id, billingId))
        .returning(returningColumns);

      return updatedBillingOrder;
    });
  };

  issue = async (billingId: string, issueBillingDto: IssueBillingDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const billingOrderDb = await this.getBillingByIdForUpdate(billingId, tx);
      if (!billingOrderDb) throw CustomError.notFound(errorMessages.billing.notFound);

      if (billingOrderDb.status === 'ISSUED')
        throw CustomError.conflict(errorMessages.billing.cannotIssueAlredyIssuedBill);

      if (billingOrderDb.status === 'VOIDED') throw CustomError.conflict(errorMessages.billing.cannotIssueVoidedBill);

      const regex =
        billingOrderDb.billingReceiptType === 'FACTURA' ? INVOICE_CODE_FACTURA_REGEX : INVOICE_CODE_BOLETA_REGEX;
      if (!regex.test(issueBillingDto.code)) {
        throw CustomError.badRequest(errorMessages.billing.invalidInvoiceCodeFormat);
      }

      const [updatedBillingOrder] = await tx
        .update(billingOrdersTable)
        .set({ status: 'ISSUED', ...issueBillingDto, updatedBy: userId })
        .where(eq(billingOrdersTable.id, billingId))
        .returning(returningColumns);

      return updatedBillingOrder;
    });
  };

  void = async (billingId: string, userId: string) => {
    return await db.transaction(async (tx) => {
      const billingOrderDb = await this.getBillingByIdForUpdate(billingId, tx);
      if (!billingOrderDb) throw CustomError.notFound(errorMessages.billing.notFound);

      if (billingOrderDb.status !== 'ISSUED') throw CustomError.conflict(errorMessages.billing.cannotVoidNotIssuedBill);

      const [updatedBillingOrder] = await tx
        .update(billingOrdersTable)
        .set({ status: 'VOIDED', updatedBy: userId })
        .where(eq(billingOrdersTable.id, billingId))
        .returning(returningColumns);

      return updatedBillingOrder;
    });
  };
}
