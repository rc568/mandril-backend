import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { reviewSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';

const lineId = randomUUID();
const issueId = randomUUID();
const review = (item: Record<string, unknown>) => reviewSupplierOrderReceiptSchema.safeParse({ items: [item] });

describe('validación de revisión de paquetes', () => {
  it('recibe una línea comprada sin exigir que el cliente repita la variante', () => {
    const result = reviewSupplierOrderReceiptSchema.parse({
      items: [{ supplierOrderProductId: lineId, availableQuantity: 8, defectiveQuantity: 2 }],
    });
    expect(result.items[0]).toEqual({ supplierOrderProductId: lineId, availableQuantity: 8, defectiveQuantity: 2 });
  });

  it('admite la variante explícita para que el servicio compruebe su correspondencia', () => {
    expect(review({ supplierOrderProductId: lineId, productVariantId: 1, availableQuantity: 1 }).success).toBe(true);
  });

  it('acepta productos no previstos con su variante y sin línea de compra', () => {
    const result = reviewSupplierOrderReceiptSchema.parse({
      items: [{ supplierOrderProductId: null, productVariantId: 1, availableQuantity: 2 }],
      observation: '  Llegaron dos unidades adicionales  ',
    });
    expect(result.items[0]).toMatchObject({ supplierOrderProductId: null, productVariantId: 1, defectiveQuantity: 0 });
    expect(result.observation).toBe('Llegaron dos unidades adicionales');
  });

  it('exige identificar una variante o una línea comprada', () => {
    const result = review({ availableQuantity: 1 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['items', 0, 'productVariantId']);
  });

  it('acepta referencias a compensaciones previstas y no previstas', () => {
    expect(review({ supplierOrderProductId: lineId, sourceIssueId: issueId, availableQuantity: 1 }).success).toBe(true);
    expect(review({ productVariantId: 1, sourceIssueId: issueId, availableQuantity: 1 }).success).toBe(true);
  });

  it('permite que una misma línea compensatoria responda a incidencias distintas', () => {
    expect(
      reviewSupplierOrderReceiptSchema.safeParse({
        items: [
          { supplierOrderProductId: lineId, sourceIssueId: issueId, availableQuantity: 1 },
          { supplierOrderProductId: lineId, sourceIssueId: randomUUID(), availableQuantity: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it('admite una recepción totalmente defectuosa', () => {
    expect(
      reviewSupplierOrderReceiptSchema.parse({
        items: [{ supplierOrderProductId: lineId, defectiveQuantity: 2 }],
      }).items[0],
    ).toMatchObject({ availableQuantity: 0, defectiveQuantity: 2 });
  });

  it('rechaza paquetes vacíos y detalles sin unidades', () => {
    expect(reviewSupplierOrderReceiptSchema.safeParse({ items: [] }).success).toBe(false);
    expect(review({ supplierOrderProductId: lineId }).success).toBe(false);
    expect(review({ supplierOrderProductId: lineId, availableQuantity: 0, defectiveQuantity: 0 }).success).toBe(false);
  });

  it.each([-1, 0.5, 2147483648, '2', null])('rechaza cantidades inválidas %s', (quantity) => {
    for (const field of ['availableQuantity', 'defectiveQuantity']) {
      expect(review({ supplierOrderProductId: lineId, availableQuantity: 1, [field]: quantity }).success).toBe(false);
    }
  });

  it.each([0, -1, 1.5, 32768, '1', null])('rechaza variantes inválidas %s', (productVariantId) => {
    expect(review({ productVariantId, availableQuantity: 1 }).success).toBe(false);
  });

  it('valida UUID de líneas e incidencias', () => {
    expect(review({ supplierOrderProductId: 'invalid', availableQuantity: 1 }).success).toBe(false);
    expect(review({ productVariantId: 1, sourceIssueId: 'invalid', availableQuantity: 1 }).success).toBe(false);
  });

  it('no permite que el cliente envíe costos ni auditoría', () => {
    for (const field of [
      'id',
      'receiptId',
      'unitCostPen',
      'unplannedUnitCostPen',
      'calculatedUnitCostPen',
      'createdBy',
    ]) {
      expect(review({ productVariantId: 1, availableQuantity: 1, [field]: 'value' }).success).toBe(false);
    }
    for (const field of ['reviewStatus', 'reviewedAt', 'reviewedBy', 'inventoryPosted']) {
      expect(
        reviewSupplierOrderReceiptSchema.safeParse({
          items: [{ productVariantId: 1, availableQuantity: 1 }],
          [field]: 'value',
        }).success,
      ).toBe(false);
    }
  });
});
