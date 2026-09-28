import { and, asc, eq } from 'drizzle-orm';
import {
  supplierOrderIssueTable,
  supplierOrderProductTable,
  supplierOrderReceiptItemTable,
  supplierOrderReceiptTable,
  supplierOrderTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';

// Use the posting transaction so the resolved costs and inventory entries belong to one operation.
// Persisted purchase costs are immutable. Missing costs must never be replaced with zero.
export async function resolveReceiptCosts(orderId: string, receiptId: string, tx: Transaction) {
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
        const sourceLine = await tx.query.supplierOrderProductTable.findFirst({
          where: eq(supplierOrderProductTable.id, issue.supplierOrderProductId),
        });
        cost = sourceLine?.calculatedUnitCostPen ?? null;
      }
      if (cost === null) throw CustomError.conflict(errorMessages.supplierOrder.compensationCostMissing);
    } else if (item.supplierOrderProductId) {
      const line = await tx.query.supplierOrderProductTable.findFirst({
        where: eq(supplierOrderProductTable.id, item.supplierOrderProductId),
      });
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
}
