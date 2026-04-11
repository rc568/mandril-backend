import type { OrderProductCurrStockAndCost, OrderProductOperationStock } from '../domain';
import type { OrderProductOutput } from '../types/order';

export const mapOrderProductsForStockOperation = (
  orderProducts: OrderProductCurrStockAndCost[],
  currentOrderProducts: OrderProductOutput[] = [],
): OrderProductOperationStock[] => {
  const orderProductsMap = currentOrderProducts.reduce((acc, p) => {
    acc.set(p.variantId, {
      variantId: p.variantId,
      price: p.price,
      purchasePrice: p.purchasePrice,
      quantity: p.quantity,
      stockToAdd: 0,
      deletedProduct: true,
    });
    return acc;
  }, new Map<number, OrderProductOperationStock>());

  orderProducts.forEach((p) => {
    const currOrderProduct = orderProductsMap.get(p.variantId);

    if (currOrderProduct) {
      orderProductsMap.set(p.variantId, {
        ...currOrderProduct,
        currentStock: p.currentStock,
        price: p.price.toFixed(6),
        quantity: p.quantity,
        stockToAdd: currOrderProduct.quantity - p.quantity,
        deletedProduct: false,
      });
    }

    if (!currOrderProduct)
      orderProductsMap.set(p.variantId, {
        ...p,
        price: p.price.toFixed(6),
        stockToAdd: -p.quantity,
        deletedProduct: false,
      });
  });

  return Array.from(orderProductsMap.values());
};
