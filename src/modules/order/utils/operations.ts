import type { OrderProductDetail, OrderProductOperation } from '../domain';
import type { OrderProductOutput } from '../types/order';

export const mapProductsForOperation = (
  updateOrderProducts: OrderProductDetail[],
  currentOrderProducts: OrderProductOutput[],
): OrderProductOperation[] => {
  const currentOrderProductsMap = currentOrderProducts.reduce((acc, p) => {
    acc.set(p.variantId, {
      variantId: p.variantId,
      price: p.price,
      purchasePrice: p.purchasePrice,
      quantity: p.quantity,
      stockToAdd: 0,
      deletedProduct: true,
    });
    return acc;
  }, new Map<number, OrderProductOperation>());

  updateOrderProducts.forEach((uop) => {
    const currOrderProduct = currentOrderProductsMap.get(uop.variantId);

    if (currOrderProduct) {
      currentOrderProductsMap.set(uop.variantId, {
        ...currOrderProduct,
        price: uop.price,
        quantity: uop.quantity,
        stockToAdd: currOrderProduct.quantity - uop.quantity,
        currentStock: uop.currentStock,
        deletedProduct: false,
      });
    }

    if (!currOrderProduct)
      currentOrderProductsMap.set(uop.variantId, {
        ...uop,
        price: uop.price,
        stockToAdd: -uop.quantity,
        deletedProduct: false,
      });
  });

  return Array.from(currentOrderProductsMap.values());
};

export const calculateOrderTotals = (orderProducts: OrderProductDetail[]) => {
  const resume = orderProducts.reduce(
    (acc, curr) => ({
      totalSale: acc.totalSale + parseFloat(curr.price) * curr.quantity,
      numProducts: acc.numProducts + curr.quantity,
      totalCost: acc.totalCost + parseFloat(curr.purchasePrice) * curr.quantity,
    }),
    { totalSale: 0, numProducts: 0, totalCost: 0 },
  );

  return {
    ...resume,
    totalSale: resume.totalSale.toFixed(6),
    totalCost: resume.totalCost.toFixed(6),
  };
};
