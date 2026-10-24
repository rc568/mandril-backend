import { describe, expect, it } from 'vitest';
import type { OrderProductDtoDetail } from '@/modules/order/domain';
import { amountToScaledInteger, calculateOrderTotals, formatScaledAmount } from '@/modules/order/utils';

const product = (type: 'SALE' | 'RETURN', price: string, purchasePrice: string, quantity: number) =>
  ({ variantId: 1, currentStock: 0, type, price, purchasePrice, quantity }) as OrderProductDtoDetail;

describe('calculateOrderTotals', () => {
  it('normalizes numeric input to the database scale using decimal rounding', () => {
    expect(formatScaledAmount(amountToScaledInteger(1.2345675))).toBe('1.234568');
  });

  it('multiplies and sums monetary amounts exactly at six decimal places', () => {
    const totals = calculateOrderTotals([
      product('SALE', '0.100001', '0.030001', 3),
      product('SALE', '0.200003', '0.070003', 2),
    ]);

    expect(totals).toEqual({ totalSale: '0.700009', totalCost: '0.230009', numProducts: 5 });
  });

  it('keeps standalone returns positive and subtracts return lines in an exchange', () => {
    const returnedProduct = product('RETURN', '50.000000', '30.000000', 1);
    const saleProduct = product('SALE', '80.000000', '48.000000', 1);

    expect(calculateOrderTotals([returnedProduct], 'RETURN')).toEqual({
      totalSale: '50.000000',
      totalCost: '30.000000',
      numProducts: 1,
    });
    expect(calculateOrderTotals([saleProduct, returnedProduct], 'EXCHANGE')).toEqual({
      totalSale: '30.000000',
      totalCost: '18.000000',
      numProducts: 0,
    });
  });
});
