import { describe, expect, it } from 'vitest';
import { createSupplierOrderReceiptSchema } from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';

describe('validación de llegada de paquetes', () => {
  it('permite omitir la fecha para que el servicio use la hora actual', () => {
    expect(createSupplierOrderReceiptSchema.parse({})).toEqual({});
  });
  it.each(['packageNumber', 'sequenceNumber'])('rechaza el consecutivo enviado por el cliente: %s', (field) => {
    expect(createSupplierOrderReceiptSchema.safeParse({ [field]: 5 }).success).toBe(false);
  });
  it.each(['invalid', '2026-02-30T10:00:00Z', '2026-09-20'])('rechaza fecha inválida o sin hora %s', (receivedAt) => {
    expect(createSupplierOrderReceiptSchema.safeParse({ receivedAt }).success).toBe(false);
  });
  it('no acepta campos de revisión, auditoría ni inventario desde la llegada', () => {
    for (const field of ['reviewStatus', 'receivedBy', 'createdBy', 'items', 'inventoryPosted']) {
      expect(createSupplierOrderReceiptSchema.safeParse({ [field]: 'value' }).success).toBe(false);
    }
  });
});
