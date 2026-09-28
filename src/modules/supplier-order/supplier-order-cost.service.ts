import { eq } from 'drizzle-orm';
import { db, supplierOrderExpenseTable, supplierOrderProductTable, supplierOrderTable } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { calculateLegacyPurchaseCosts } from './utils/calculate-legacy-purchase-costs';

export class SupplierOrderCostService {
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
      const products = await tx
        .select()
        .from(supplierOrderProductTable)
        .where(eq(supplierOrderProductTable.supplierOrderId, orderId));
      if (products.some((product) => product.calculatedUnitCost !== null || product.calculatedUnitCostPen !== null)) {
        throw CustomError.conflict(errorMessages.supplierOrder.costsAlreadyCalculated);
      }
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
}
