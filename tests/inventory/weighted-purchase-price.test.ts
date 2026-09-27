import { describe, expect, it } from 'vitest';
import { calculateWeightedPurchasePrice } from '@/modules/inventory/utils/calculate-weighted-purchase-price';
import { errorMessages } from '@/shared/domain';

const input = () => ({
  currentPurchasePrice: '60.000000',
  currentAvailableQuantity: 8,
  currentReservedQuantity: 2,
  receiptItems: [{ availableQuantity: 5, defectiveQuantity: 0, unitCostPen: '90.000000' }],
});

describe('promedio ponderado de purchasePrice', () => {
  it('incluye disponibles y reservadas que siguen físicamente en tienda', () => {
    expect(calculateWeightedPurchasePrice(input())).toBe('70.000000');
    expect(
      calculateWeightedPurchasePrice({ ...input(), currentAvailableQuantity: 0, currentReservedQuantity: 10 }),
    ).toBe('70.000000');
  });

  it('usa exclusivamente las unidades buenas de una recepción mixta', () => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        receiptItems: [{ availableQuantity: 5, defectiveQuantity: 100, unitCostPen: '90.000000' }],
      }),
    ).toBe('70.000000');
  });

  it('combina líneas con costos distintos para la misma variante', () => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        receiptItems: [
          { availableQuantity: 2, defectiveQuantity: 0, unitCostPen: '90.000000' },
          { availableQuantity: 3, defectiveQuantity: 1, unitCostPen: '40.000000' },
        ],
      }),
    ).toBe('60.000000');
  });

  it('los sobrantes gratuitos disminuyen el promedio sin confundirse con costos pendientes', () => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        receiptItems: [{ availableQuantity: 5, defectiveQuantity: 0, unitCostPen: '0.000000' }],
      }),
    ).toBe('40.000000');
  });

  it('valora una compensación con el costo original proporcionado aunque no tenga pago nuevo', () => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        receiptItems: [{ availableQuantity: 2, defectiveQuantity: 0, unitCostPen: '30.000000' }],
      }),
    ).toBe('55.000000');
  });

  it('sin stock anterior utiliza el promedio de los ingresos y descarta el precio anterior', () => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        currentAvailableQuantity: 0,
        currentReservedQuantity: 0,
        receiptItems: [
          { availableQuantity: 2, defectiveQuantity: 0, unitCostPen: '90.000000' },
          { availableQuantity: 1, defectiveQuantity: 0, unitCostPen: '0.000000' },
        ],
      }),
    ).toBe('60.000000');
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        currentAvailableQuantity: 0,
        currentReservedQuantity: 0,
        receiptItems: [{ availableQuantity: 1, defectiveQuantity: 0, unitCostPen: '0.000000' }],
      }),
    ).toBe('0.000000');
  });

  it.each([0, 10])('conserva el precio si solo ingresan defectuosas y hay %i unidades actuales', (stock) => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        currentAvailableQuantity: stock,
        currentReservedQuantity: 0,
        receiptItems: [{ availableQuantity: 0, defectiveQuantity: 5, unitCostPen: '90.000000' }],
      }),
    ).toBe('60.000000');
  });

  it('una lista vacía conserva el precio sin dividir por cero', () => {
    expect(
      calculateWeightedPurchasePrice({
        ...input(),
        currentAvailableQuantity: 0,
        currentReservedQuantity: 0,
        receiptItems: [],
      }),
    ).toBe('60.000000');
  });

  it('redondea una sola vez y no depende del orden de las líneas', () => {
    const data = {
      ...input(),
      currentPurchasePrice: '0',
      currentAvailableQuantity: 1,
      currentReservedQuantity: 0,
      receiptItems: [
        { availableQuantity: 1, defectiveQuantity: 0, unitCostPen: '0.000001' },
        { availableQuantity: 1, defectiveQuantity: 0, unitCostPen: '0' },
      ],
    };
    expect(calculateWeightedPurchasePrice(data)).toBe('0.000000');
    expect(calculateWeightedPurchasePrice({ ...data, receiptItems: [...data.receiptItems].reverse() })).toBe(
      '0.000000',
    );
    expect(calculateWeightedPurchasePrice({ ...data, receiptItems: data.receiptItems.slice(0, 1) })).toBe('0.000001');
  });

  it('mantiene precisión exacta con importes y cantidades máximas', () => {
    expect(
      calculateWeightedPurchasePrice({
        currentPurchasePrice: '999999.999999',
        currentAvailableQuantity: 2147483647,
        currentReservedQuantity: 2147483647,
        receiptItems: [{ availableQuantity: 2147483647, defectiveQuantity: 0, unitCostPen: '999999.999999' }],
      }),
    ).toBe('999999.999999');
  });

  it.each([0, 1])('rechaza costo pendiente aun cuando las unidades buenas son %i', (availableQuantity) => {
    expect(() =>
      calculateWeightedPurchasePrice({
        ...input(),
        receiptItems: [{ availableQuantity, defectiveQuantity: 1, unitCostPen: null }],
      }),
    ).toThrow(errorMessages.inventory.finalCostRequired);
  });

  it.each(['-0.000001', '1000000', '0.0000001', 'NaN', 'Infinity', ''])(
    'rechaza costos fuera del formato permitido: %s',
    (cost) => {
      expect(() => calculateWeightedPurchasePrice({ ...input(), currentPurchasePrice: cost })).toThrow(
        errorMessages.inventory.invalidCost,
      );
      expect(() =>
        calculateWeightedPurchasePrice({
          ...input(),
          receiptItems: [{ availableQuantity: 1, defectiveQuantity: 0, unitCostPen: cost }],
        }),
      ).toThrow(errorMessages.inventory.invalidCost);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, 2147483648])('rechaza cantidades inválidas: %s', (quantity) => {
    expect(() => calculateWeightedPurchasePrice({ ...input(), currentAvailableQuantity: quantity })).toThrow(
      errorMessages.inventory.invalidQuantity,
    );
    expect(() => calculateWeightedPurchasePrice({ ...input(), currentReservedQuantity: quantity })).toThrow(
      errorMessages.inventory.invalidQuantity,
    );
    for (const field of ['availableQuantity', 'defectiveQuantity']) {
      expect(() =>
        calculateWeightedPurchasePrice({
          ...input(),
          receiptItems: [{ ...input().receiptItems[0], [field]: quantity }],
        }),
      ).toThrow(errorMessages.inventory.invalidQuantity);
    }
  });

  it('rechaza un detalle sin unidades', () => {
    expect(() =>
      calculateWeightedPurchasePrice({
        ...input(),
        receiptItems: [{ availableQuantity: 0, defectiveQuantity: 0, unitCostPen: '0' }],
      }),
    ).toThrow(errorMessages.inventory.emptyReceiptItem);
  });

  it('no modifica los datos de entrada', () => {
    const data = input();
    const before = structuredClone(data);
    calculateWeightedPurchasePrice(data);
    expect(data).toEqual(before);
  });
});
