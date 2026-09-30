import { eq, sql } from 'drizzle-orm';
import {
  db,
  inventoryBalanceTable,
  orderProductTable,
  orderTable,
  productVariantTable,
  stockMovementTable,
  userTable,
} from '@/shared/db';

// Maintenance-only data migration. Schema changes must already be applied.
// Legacy quantityInStock is free stock: pending sales were already deducted.
export async function migrateLegacyInventory(userId: string, apply = false) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(
      sql`LOCK TABLE "order", order_products, product_variant, inventory_balance, stock_movement IN SHARE ROW EXCLUSIVE MODE`,
    );
    const [actor] = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, userId));
    if (!actor) throw new Error('El usuario de auditoría no existe.');
    const [existingBalance] = await tx
      .select({ id: inventoryBalanceTable.productVariantId })
      .from(inventoryBalanceTable)
      .limit(1);
    const [modernMovement] = await tx
      .select({ id: stockMovementTable.id })
      .from(stockMovementTable)
      .where(sql`${stockMovementTable.fromBucket} IS NOT NULL OR ${stockMovementTable.toBucket} IS NOT NULL`)
      .limit(1);
    if (existingBalance || modernMovement)
      throw new Error('Ya existen saldos o movimientos nuevos. No se mezclarán con el stock anterior.');
    const variants = await tx.select().from(productVariantTable);
    const orders = await tx
      .select()
      .from(orderTable)
      .where(sql`${orderTable.type} = 'SALE' AND ${orderTable.status} IN ('PENDING', 'PAID')`);
    if (orders.some((order) => order.deletedAt !== null))
      throw new Error('Hay ventas pendientes eliminadas. Revise sus existencias antes de migrar.');
    const lines = await tx
      .select()
      .from(orderProductTable)
      .where(
        sql`${orderProductTable.orderId} IN (SELECT id FROM "order" WHERE type = 'SALE' AND status IN ('PENDING', 'PAID'))`,
      );
    const legacyMovements = await tx
      .select()
      .from(stockMovementTable)
      .where(
        sql`${stockMovementTable.orderId} IN (SELECT id FROM "order" WHERE type = 'SALE' AND status IN ('PENDING', 'PAID'))`,
      );
    for (const order of orders) {
      if (!lines.some((line) => line.orderId === order.id)) throw new Error(`Venta sin productos: ${order.id}`);
    }
    for (const movement of legacyMovements) {
      if (
        movement.type !== 'SALE' ||
        movement.quantity <= 0 ||
        movement.deletedAt !== null ||
        movement.deletedBy !== null ||
        !lines.some((line) => line.orderId === movement.orderId && line.productVariantId === movement.productVariantId)
      )
        throw new Error(`Movimiento histórico incompatible con una reserva: ${movement.id}`);
    }
    const reservations: (typeof stockMovementTable.$inferInsert)[] = [];
    const reservedByVariant = new Map<number, number>();
    for (const line of lines) {
      if (line.type !== 'SALE' || line.quantity <= 0) throw new Error(`Línea de venta inválida: ${line.id}`);
      const sources = legacyMovements.filter(
        (movement) => movement.orderId === line.orderId && movement.productVariantId === line.productVariantId,
      );
      if (sources.length > 0 && sources.reduce((sum, movement) => sum + movement.quantity, 0) !== line.quantity)
        throw new Error(`La venta y sus movimientos no coinciden: ${line.orderId}, variante ${line.productVariantId}`);
      const parts =
        sources.length > 0
          ? sources.map((source) => ({ quantity: source.quantity, legacyMovementId: source.id }))
          : [{ quantity: line.quantity, legacyMovementId: null }];
      for (const part of parts)
        reservations.push({
          ...part,
          productVariantId: line.productVariantId,
          orderId: line.orderId,
          type: 'RESERVATION',
          fromBucket: 'AVAILABLE',
          toBucket: 'RESERVED',
          unitCostPen: line.purchasePrice,
          note: 'Legacy inventory migration: outstanding sale reservation',
          createdBy: userId,
        });
      reservedByVariant.set(line.productVariantId, (reservedByVariant.get(line.productVariantId) ?? 0) + line.quantity);
    }
    const balances = variants.map((variant) => {
      const reserved = reservedByVariant.get(variant.id) ?? 0;
      if (variant.quantityInStock < 0 || variant.quantityInStock + reserved > 2147483647)
        throw new Error(`Saldo inválido o fuera de rango: variante ${variant.id}`);
      return {
        productVariantId: variant.id,
        available: variant.quantityInStock,
        reserved,
        unitCostPen: variant.purchasePrice,
      };
    });
    if (apply) {
      for (const balance of balances) {
        await tx.insert(inventoryBalanceTable).values([
          {
            productVariantId: balance.productVariantId,
            bucket: 'AVAILABLE',
            quantity: balance.available,
            updatedBy: userId,
          },
          {
            productVariantId: balance.productVariantId,
            bucket: 'RESERVED',
            quantity: balance.reserved,
            updatedBy: userId,
          },
        ]);
        const physicalGoodQuantity = balance.available + balance.reserved;
        if (physicalGoodQuantity > 0)
          await tx.insert(stockMovementTable).values({
            productVariantId: balance.productVariantId,
            type: 'ADJUSTMENT',
            toBucket: 'AVAILABLE',
            quantity: physicalGoodQuantity,
            unitCostPen: balance.unitCostPen,
            note: 'Legacy inventory migration: opening balance including outstanding reservations',
            createdBy: userId,
          });
      }
      for (const reservation of reservations) await tx.insert(stockMovementTable).values(reservation);
    }
    return {
      applied: apply,
      variants: balances.length,
      pendingSales: orders.length,
      reservations: reservations.length,
      balances,
    };
  });
}
