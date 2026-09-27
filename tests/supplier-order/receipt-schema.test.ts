import { describe, expect, it } from 'vitest';
import { createSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';

describe('validación de llegada de paquetes', () => {
  it('permite omitir la fecha para que el servicio use la hora actual', () => {
    expect(createSupplierOrderReceiptSchema.parse({ packageNumber: 1 })).toEqual({ packageNumber: 1 });
  });
  it.each([0, -1, 1.5, 2147483648])('rechaza número de paquete inválido %s', (packageNumber) => {
    expect(createSupplierOrderReceiptSchema.safeParse({ packageNumber }).success).toBe(false);
  });
  it.each(['invalid', '2026-02-30T10:00:00Z', '2026-09-20'])('rechaza fecha inválida o sin hora %s', (receivedAt) => {
    expect(createSupplierOrderReceiptSchema.safeParse({ packageNumber: 1, receivedAt }).success).toBe(false);
  });
  it('no acepta campos de revisión, auditoría ni inventario desde la llegada', () => {
    for (const field of ['reviewStatus', 'receivedBy', 'createdBy', 'items', 'inventoryPosted']) {
      expect(createSupplierOrderReceiptSchema.safeParse({ packageNumber: 1, [field]: 'value' }).success).toBe(false);
    }
  });
});
