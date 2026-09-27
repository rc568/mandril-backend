import { describe, expect, it } from 'vitest';
import { calculateLegacyPurchaseCosts } from '@/modules/supplier-order/utils/calculate-legacy-purchase-costs';
import { errorMessages } from '@/shared/domain';

const input = () => ({
  currency: 'USD' as const,
  projectedExchangeRate: '3.400000',
  products: [
    { id: 'camera', type: 'PURCHASE' as const, quantityOrdered: 20, unitPrice: '21.250000' },
    { id: 'other', type: 'PURCHASE' as const, quantityOrdered: 1, unitPrice: '355.000000' },
  ],
  expenses: [
    { amountUsd: '399.350000', amountPen: null },
    { amountUsd: '266.000000', amountPen: null },
    { amountUsd: '42.000000', amountPen: null },
  ],
});

describe('cálculo puro LEGACY_V1', () => {
  it('reproduce el ejemplo Excel con seis decimales sin modificar los datos', () => {
    const data = input();
    const before = structuredClone(data);
    expect(calculateLegacyPurchaseCosts(data)[0]).toEqual({
      supplierOrderProductId: 'camera',
      calculatedUnitCost: '47.814489',
      calculatedUnitCostPen: '162.569262',
    });
    expect(data).toEqual(before);
  });

  it('calcula en USD dejando PEN pendiente cuando no hay tipo de cambio', () => {
    expect(calculateLegacyPurchaseCosts({ ...input(), projectedExchangeRate: null })[0]).toMatchObject({
      calculatedUnitCost: '47.814489',
      calculatedUnitCostPen: null,
    });
  });

  it('permite recalcular una vista previa con otro tipo de cambio sin alterar el costo USD', () => {
    const original = calculateLegacyPurchaseCosts(input())[0];
    const changed = calculateLegacyPurchaseCosts({ ...input(), projectedExchangeRate: '4.000000' })[0];
    expect(changed.calculatedUnitCost).toBe(original.calculatedUnitCost);
    expect(changed.calculatedUnitCostPen).toBe('191.257955');
  });

  it('usa los importes PEN para una compra PEN sin necesitar conversión', () => {
    const result = calculateLegacyPurchaseCosts({
      currency: 'PEN',
      projectedExchangeRate: null,
      products: [{ id: 'one', type: 'PURCHASE', quantityOrdered: 2, unitPrice: '100.000000' }],
      expenses: [{ amountUsd: '999.000000', amountPen: '20.000000' }],
    });
    expect(result[0]).toMatchObject({ calculatedUnitCost: '129.800000', calculatedUnitCostPen: '129.800000' });
  });

  it('admite envío gratuito y asigna costo cero a líneas gratuitas', () => {
    const result = calculateLegacyPurchaseCosts({
      ...input(),
      expenses: [],
      products: [
        { id: 'paid', type: 'PURCHASE', quantityOrdered: 1, unitPrice: '10.000000' },
        { id: 'free', type: 'PURCHASE', quantityOrdered: 3, unitPrice: '0.000000' },
      ],
    });
    expect(result[0].calculatedUnitCost).toBe('11.800000');
    expect(result[1]).toMatchObject({ calculatedUnitCost: '0.000000', calculatedUnitCostPen: '0.000000' });
  });

  it('no reparte gastos entre compensaciones ni inventa su costo original', () => {
    const data = input();
    expect(
      calculateLegacyPurchaseCosts({
        ...data,
        products: [
          ...data.products,
          { id: 'replacement', type: 'COMPENSATION', quantityOrdered: 10, unitPrice: '0.000000' },
        ],
      }),
    ).toEqual(calculateLegacyPurchaseCosts(data));
    expect(
      calculateLegacyPurchaseCosts({
        ...data,
        products: [{ id: 'replacement', type: 'COMPENSATION', quantityOrdered: 10, unitPrice: '0.000000' }],
      }),
    ).toEqual([]);
  });

  it('no convierte gastos usando el tipo proyectado ni interpreta importes desconocidos como cero', () => {
    expect(() =>
      calculateLegacyPurchaseCosts({ ...input(), expenses: [{ amountUsd: null, amountPen: '100.000000' }] }),
    ).toThrow(errorMessages.supplierOrder.costDataMissing);
    expect(() =>
      calculateLegacyPurchaseCosts({
        ...input(),
        products: [{ id: 'unknown', type: 'PURCHASE', quantityOrdered: 1, unitPrice: null }],
      }),
    ).toThrow(errorMessages.supplierOrder.costDataMissing);
  });

  it('rechaza una base cero cuando no se pueden distribuir los gastos por valor', () => {
    expect(() =>
      calculateLegacyPurchaseCosts({
        ...input(),
        products: [{ id: 'free', type: 'PURCHASE', quantityOrdered: 1, unitPrice: '0.000000' }],
      }),
    ).toThrow(errorMessages.supplierOrder.costBaseRequired);
  });

  it('redondea una sola vez por moneda y conserva cantidades muy pequeñas', () => {
    const result = calculateLegacyPurchaseCosts({
      currency: 'USD',
      projectedExchangeRate: '3.000000',
      products: [{ id: 'small', type: 'PURCHASE', quantityOrdered: 1, unitPrice: '0.000003' }],
      expenses: [],
    })[0];
    expect(result).toMatchObject({ calculatedUnitCost: '0.000004', calculatedUnitCostPen: '0.000011' });
  });

  it.each(['-1.000000', '0.0000001', 'NaN'])('rechaza un importe inválido: %s', (unitPrice) => {
    const data = input();
    data.products[0].unitPrice = unitPrice;
    expect(() => calculateLegacyPurchaseCosts(data)).toThrow(errorMessages.supplierOrder.costAmountInvalid);
  });

  it('rechaza tipos de cambio cero y costos que exceden decimal(12,6)', () => {
    expect(() => calculateLegacyPurchaseCosts({ ...input(), projectedExchangeRate: '0.000000' })).toThrow(
      errorMessages.supplierOrder.costAmountInvalid,
    );
    expect(() => calculateLegacyPurchaseCosts({ ...input(), projectedExchangeRate: '999999.999999' })).toThrow(
      errorMessages.supplierOrder.costTooLarge,
    );
  });
});
