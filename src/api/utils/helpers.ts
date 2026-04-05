import type { OrderProductOutput } from '../../db/types';
import type { OrderProductCurrStockAndCost, OrderProductOperationStock } from '../../domain/order';

export const isValueSerialSmall = (num: number): boolean => {
  if (Number.isInteger(num) && num > 0 && num < 32768) return true;
  return false;
};

export const isValidSlug = (slug: string, maxLength: number = 50): boolean => {
  const slugRegex = /^[0-9a-z-]+$/;
  return slugRegex.test(slug) && slug.length <= maxLength;
};

export const isOneOf = <T extends readonly unknown[]>(value: unknown, allowedValues: T): value is T[number] => {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return false;
  }
  return allowedValues.includes(value as T[number]);
};

export const getOrderProducts = (
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
