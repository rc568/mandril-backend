import type { OrderProductDtoDetail, OrderProductDtoOperation } from '../domain';
import type { OrderProductOutput } from '../types/order';

export const mapProductsForOperation = (
  updateOrderProducts: OrderProductDtoDetail[],
  currentOrderProducts: OrderProductOutput[],
): OrderProductDtoOperation[] => {
  const productsOrderOperation = currentOrderProducts.reduce((acc, p) => {
    acc.set(p.variantId, {
      variantId: p.variantId,
      price: p.price,
      quantity: p.quantity,
      stockToAdd: p.quantity,
      purchasePrice: '0',
      type: 'RETURN',
    });
    return acc;
  }, new Map<number, OrderProductDtoOperation>());

  updateOrderProducts.forEach((uop) => {
    const currOrderProduct = productsOrderOperation.get(uop.variantId);

    if (currOrderProduct) {
      productsOrderOperation.set(uop.variantId, {
        ...currOrderProduct,
        price: uop.price,
        quantity: uop.quantity,
        purchasePrice: uop.purchasePrice,
        stockToAdd: currOrderProduct.quantity - uop.quantity,
        currentStock: uop.currentStock,
        type: 'SALE',
      });
    }

    if (!currOrderProduct)
      productsOrderOperation.set(uop.variantId, {
        ...uop,
        stockToAdd: -uop.quantity,
        type: 'SALE',
      });
  });

  return Array.from(productsOrderOperation.values());
};

export const calculateOrderTotals = (orderProducts: OrderProductDtoDetail[]) => {
  const resume = orderProducts.reduce(
    (acc, curr) => {
      const quantity = curr.type === 'SALE' ? curr.quantity : -curr.quantity;
      return {
        totalSale: acc.totalSale + parseFloat(curr.price) * quantity,
        numProducts: acc.numProducts + curr.quantity,
        totalCost: acc.totalCost + parseFloat(curr.purchasePrice) * curr.quantity,
      };
    },
    { totalSale: 0, numProducts: 0, totalCost: 0 },
  );

  return {
    ...resume,
    totalSale: resume.totalSale.toFixed(6),
    totalCost: resume.totalCost.toFixed(6),
  };
};
