import { and, asc, eq, inArray, or } from 'drizzle-orm';
import {
  db,
  stockMovementTable,
  supplierOrderExpenseTable,
  supplierOrderIssueTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';

import { calculateLegacyPurchaseCosts } from './utils/calculate-legacy-purchase-costs';

export class SupplierOrderCostService {
  // Call with the purchase locked. Source-line locks also synchronize with compensation posting.
  assertCostsNotPosted = async (orderId: string, tx: Transaction) => {
    const lines = await tx
      .select()
      .from(supplierOrderProductTable)
      .where(eq(supplierOrderProductTable.supplierOrderId, orderId))
      .orderBy(asc(supplierOrderProductTable.id))
      .for('update');
    const [movement] = await tx
      .select({ id: stockMovementTable.id })
      .from(stockMovementTable)
      .where(eq(stockMovementTable.purchaseId, orderId))
      .limit(1);
    if (movement) throw CustomError.conflict(errorMessages.supplierOrder.costsAlreadyPosted);

    const purchasedIds = lines.filter((line) => line.type === 'PURCHASE').map((line) => line.id);
    if (purchasedIds.length === 0) return;
    const originalItems = await tx
      .select({ id: supplierOrderReceiptItemTable.id })
      .from(supplierOrderReceiptItemTable)
      .where(inArray(supplierOrderReceiptItemTable.supplierOrderProductId, purchasedIds));
    let issues = await tx
      .select({ id: supplierOrderIssueTable.id })
      .from(supplierOrderIssueTable)
      .where(
        or(
          and(
            inArray(supplierOrderIssueTable.type, ['SHORTAGE', 'WRONG_PRODUCT']),
            inArray(supplierOrderIssueTable.supplierOrderProductId, purchasedIds),
          ),
          and(
            eq(supplierOrderIssueTable.type, 'DEFECTIVE'),
            inArray(
              supplierOrderIssueTable.receiptItemId,
              originalItems.map((item) => item.id),
            ),
          ),
        ),
      );
    const visited = new Set<string>();
    while (issues.length > 0) {
      const ids = issues.map((issue) => issue.id).filter((id) => !visited.has(id));
      if (ids.length === 0) break;
      for (const id of ids) visited.add(id);
      const replacements = await tx
        .select({ id: supplierOrderReceiptItemTable.id })
        .from(supplierOrderReceiptItemTable)
        .where(inArray(supplierOrderReceiptItemTable.sourceIssueId, ids));
      if (replacements.length === 0) break;
      const itemIds = replacements.map((item) => item.id);
      const [posted] = await tx
        .select({ id: stockMovementTable.id })
        .from(stockMovementTable)
        .where(inArray(stockMovementTable.supplierOrderReceiptItemId, itemIds))
        .limit(1);
      if (posted) throw CustomError.conflict(errorMessages.supplierOrder.costsAlreadyPosted);
      // A defective replacement can originate another replacement inheriting the same cost.
      issues = await tx
        .select({ id: supplierOrderIssueTable.id })
        .from(supplierOrderIssueTable)
        .where(
          and(eq(supplierOrderIssueTable.type, 'DEFECTIVE'), inArray(supplierOrderIssueTable.receiptItemId, itemIds)),
        );
    }
  };

  calculateAndSave = async (orderId: string, userId: string) => {
    return db.transaction(async (tx) => {
      // This lock also serializes exchange-rate changes and receipt operations.
      const [order] = await tx
        .select()
        .from(supplierOrderTable)
        .where(eq(supplierOrderTable.id, orderId))
        .for('update');
      if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
      if (order.recordOrigin !== 'SYSTEM' || !['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status)) {
        throw CustomError.conflict(errorMessages.supplierOrder.costsNotReady);
      }
      if (order.costCalculationVersion !== 'LEGACY_V1') {
        throw CustomError.conflict(errorMessages.supplierOrder.costVersionUnsupported);
      }
      await this.assertCostsNotPosted(orderId, tx);
      const products = await tx
        .select()
        .from(supplierOrderProductTable)
        .where(eq(supplierOrderProductTable.supplierOrderId, orderId));
      if (!products.some((product) => product.type === 'PURCHASE')) {
        throw CustomError.conflict(errorMessages.supplierOrder.costsRequirePurchasedProducts);
      }
      if (order.currency === null || (order.currency === 'USD' && order.projectedExchangeRate === null)) {
        throw CustomError.conflict(errorMessages.supplierOrder.finalCostConversionRequired);
      }
      const expenses = await tx
        .select()
        .from(supplierOrderExpenseTable)
        .where(eq(supplierOrderExpenseTable.supplierOrderId, orderId));
      const costs = calculateLegacyPurchaseCosts({
        currency: order.currency,
        projectedExchangeRate: order.projectedExchangeRate,
        products,
        expenses,
      });
      for (const cost of costs) {
        await tx
          .update(supplierOrderProductTable)
          .set({
            calculatedUnitCost: cost.calculatedUnitCost,
            calculatedUnitCostPen: cost.calculatedUnitCostPen,
            updatedBy: userId,
          })
          .where(eq(supplierOrderProductTable.id, cost.supplierOrderProductId));
      }
      await tx.update(supplierOrderTable).set({ updatedBy: userId }).where(eq(supplierOrderTable.id, orderId));
      // Compensation details inherit their own source costs; they are not part of this allocation.
      return costs;
    });
  };

  // Use the posting transaction so the resolved costs and inventory entries belong to one operation.
  // Source-line locks prevent recalculation until posting commits. Missing costs never mean zero.
  resolveReceiptCosts = async (orderId: string, receiptId: string, tx: Transaction) => {
    const [order] = await tx.select().from(supplierOrderTable).where(eq(supplierOrderTable.id, orderId)).for('update');
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    if (order.recordOrigin !== 'SYSTEM' || !['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status)) {
      throw CustomError.conflict(errorMessages.inventory.receiptNotReady);
    }
    const receipt = await tx.query.supplierOrderReceiptTable.findFirst({
      where: and(eq(supplierOrderReceiptTable.id, receiptId), eq(supplierOrderReceiptTable.supplierOrderId, orderId)),
    });
    if (!receipt) throw CustomError.notFound(errorMessages.inventory.receiptNotFound);
    if (receipt.reviewStatus !== 'COMPLETED') throw CustomError.conflict(errorMessages.inventory.receiptNotReady);
    const items = await tx
      .select()
      .from(supplierOrderReceiptItemTable)
      .where(eq(supplierOrderReceiptItemTable.receiptId, receiptId))
      .orderBy(asc(supplierOrderReceiptItemTable.id));
    if (items.length === 0) throw CustomError.conflict(errorMessages.inventory.receiptNotReady);

    const resolved = new Map<string, string>();
    const resolving = new Set<string>();
    const resolveItem = async (item: typeof supplierOrderReceiptItemTable.$inferSelect): Promise<string> => {
      const saved = resolved.get(item.id);
      if (saved !== undefined) return saved;
      if (resolving.has(item.id)) throw CustomError.conflict(errorMessages.supplierOrder.compensationCostCycle);
      resolving.add(item.id);
      let cost: string | null = null;
      if (item.sourceIssueId) {
        const issue = await tx.query.supplierOrderIssueTable.findFirst({
          where: eq(supplierOrderIssueTable.id, item.sourceIssueId),
        });
        if (!issue) throw CustomError.conflict(errorMessages.supplierOrder.compensationCostMissing);
        // A claim can be closed after its compensation was reviewed. Closure does not invalidate its cost.
        if (issue.type === 'DEFECTIVE' && issue.receiptItemId) {
          const sourceItem = await tx.query.supplierOrderReceiptItemTable.findFirst({
            where: eq(supplierOrderReceiptItemTable.id, issue.receiptItemId),
          });
          if (sourceItem) cost = await resolveItem(sourceItem);
        } else if (issue.supplierOrderProductId) {
          const [sourceLine] = await tx
            .select()
            .from(supplierOrderProductTable)
            .where(eq(supplierOrderProductTable.id, issue.supplierOrderProductId))
            .for('share');
          cost = sourceLine?.calculatedUnitCostPen ?? null;
        }
        if (cost === null) throw CustomError.conflict(errorMessages.supplierOrder.compensationCostMissing);
      } else if (item.supplierOrderProductId) {
        const [line] = await tx
          .select()
          .from(supplierOrderProductTable)
          .where(eq(supplierOrderProductTable.id, item.supplierOrderProductId))
          .for('share');
        if (line?.type === 'PURCHASE') cost = line.calculatedUnitCostPen;
      } else {
        cost = item.unplannedUnitCostPen;
      }
      if (cost === null) throw CustomError.conflict(errorMessages.inventory.finalCostRequired);
      resolving.delete(item.id);
      resolved.set(item.id, cost);
      return cost;
    };

    const costs: { receiptItemId: string; unitCostPen: string }[] = [];
    for (const item of items) costs.push({ receiptItemId: item.id, unitCostPen: await resolveItem(item) });
    return costs;
  };
}
