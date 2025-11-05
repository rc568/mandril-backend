import type { OrderProductOutput } from '../../db/types';
import type { OrderProductDto } from '../validators';

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

export const getOrderProducts = (orderProducts: OrderProductDto[], currentOrderProducts: OrderProductOutput[] = []) => {
  const orderProductsMap = currentOrderProducts.reduce((acc, p) => {
    acc.set(p.variantId, {
      variantId: p.variantId,
      price: p.price,
      quantity: p.quantity,
      stockToAdd: p.quantity,
      deletedProduct: true,
    });
    return acc;
  }, new Map<
    number,
    { variantId: number; price: number; quantity: number; stockToAdd: number; deletedProduct: boolean }
  >());

  orderProducts.forEach((p) => {
    const currOrderProduct = orderProductsMap.get(p.variantId);

    if (currOrderProduct) {
      orderProductsMap.set(p.variantId, {
        ...currOrderProduct,
        price: p.price,
        quantity: p.quantity,
        stockToAdd: -(p.quantity - currOrderProduct.quantity),
        deletedProduct: false,
      });
    }
    if (!currOrderProduct) orderProductsMap.set(p.variantId, { ...p, stockToAdd: -p.quantity, deletedProduct: false });
  });

  return Array.from(orderProductsMap.values());
};
