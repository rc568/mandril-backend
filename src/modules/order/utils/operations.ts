import type { OrderProductDtoDetail, OrderProductDtoOperation, OrderType } from '../domain';
import type { OrderProductOutput } from '../types/order';
import { amountToScaledInteger, formatScaledAmount } from './monetary';

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

export const calculateOrderTotals = (orderProducts: OrderProductDtoDetail[], orderType: OrderType = 'SALE') => {
  const resume = orderProducts.reduce(
    (acc, curr) => {
      const sign = orderType === 'EXCHANGE' && curr.type === 'RETURN' ? -1n : 1n;
      const quantity = BigInt(curr.quantity) * sign;
      return {
        totalSale: acc.totalSale + amountToScaledInteger(curr.price) * quantity,
        numProducts: acc.numProducts + Number(quantity),
        totalCost: acc.totalCost + amountToScaledInteger(curr.purchasePrice) * quantity,
      };
    },
    { totalSale: 0n, numProducts: 0, totalCost: 0n },
  );

  return {
    ...resume,
    totalSale: formatScaledAmount(resume.totalSale),
    totalCost: formatScaledAmount(resume.totalCost),
  };
};
