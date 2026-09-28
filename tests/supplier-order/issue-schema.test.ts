import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  closeSupplierOrderIssueSchema,
  createSupplierOrderIssueSchema,
} from '@/modules/supplier-order/schemas/supplier-order-issue.schema';

const supplierOrderProductId = randomUUID();
const receiptItemId = randomUUID();
const base = { quantity: 1, description: '  Falta una cámara  ' };

describe('validación de incidencias de compra', () => {
  it.each([
    { type: 'SHORTAGE', supplierOrderProductId },
    { type: 'DEFECTIVE', receiptItemId },
    { type: 'DEFECTIVE', receiptItemId, supplierOrderProductId },
    { type: 'WRONG_PRODUCT', receiptItemId, supplierOrderProductId },
  ])('acepta las referencias de $type', (references) => {
    expect(createSupplierOrderIssueSchema.parse({ ...base, ...references }).description).toBe('Falta una cámara');
  });
  it.each([
    { type: 'SHORTAGE' },
    { type: 'SHORTAGE', supplierOrderProductId, receiptItemId },
    { type: 'DEFECTIVE', supplierOrderProductId },
    { type: 'WRONG_PRODUCT', supplierOrderProductId },
    { type: 'WRONG_PRODUCT', receiptItemId },
  ])('rechaza referencias incompletas o incompatibles: %j', (references) => {
    expect(createSupplierOrderIssueSchema.safeParse({ ...base, ...references }).success).toBe(false);
  });
  it.each([0, -1, 1.5, 2147483648])('rechaza cantidad %s', (quantity) => {
    expect(
      createSupplierOrderIssueSchema.safeParse({ ...base, type: 'SHORTAGE', supplierOrderProductId, quantity }).success,
    ).toBe(false);
  });
  it('exige descripción y rechaza estado o auditoría enviados por el cliente', () => {
    const input = { ...base, type: 'SHORTAGE', supplierOrderProductId };
    for (const fields of [{ description: '  ' }, { status: 'CLOSED' }, { createdBy: randomUUID() }]) {
      expect(createSupplierOrderIssueSchema.safeParse({ ...input, ...fields }).success).toBe(false);
    }
  });
  it('exige una resolución y deja la auditoría del cierre al servicio', () => {
    expect(closeSupplierOrderIssueSchema.parse({ resolutionNote: ' Crédito recibido ' })).toEqual({
      resolutionNote: 'Crédito recibido',
    });
    for (const input of [{}, { resolutionNote: ' ' }, { resolutionNote: 'Crédito', closedAt: new Date() }]) {
      expect(closeSupplierOrderIssueSchema.safeParse(input).success).toBe(false);
    }
  });
});
