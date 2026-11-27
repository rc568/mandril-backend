import { describe, expect, it } from 'vitest';
import {
  reviewSupplierOrderReceiptSchema,
  updateSupplierOrderReceiptSchema,
} from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';

describe('validación de acciones sobre paquetes', () => {
  it('la revisión solo admite observación y rechaza productos', () => {
    expect(reviewSupplierOrderReceiptSchema.safeParse(undefined).success).toBe(true);
    expect(reviewSupplierOrderReceiptSchema.parse({})).toEqual({});
    expect(reviewSupplierOrderReceiptSchema.safeParse({ observation: 'Revisión completa' }).success).toBe(true);
    expect(reviewSupplierOrderReceiptSchema.parse({ items: [] })).toEqual({});
  });

  it('permite editar datos y reemplazar detalles con al menos una unidad', () => {
    expect(updateSupplierOrderReceiptSchema.safeParse({ observation: 'Ajuste' }).success).toBe(true);
    expect(
      updateSupplierOrderReceiptSchema.safeParse({
        items: [{ supplierOrderProductId: '00000000-0000-4000-8000-000000000001', availableQuantity: 1 }],
      }).success,
    ).toBe(true);
    expect(updateSupplierOrderReceiptSchema.safeParse({ items: [] }).success).toBe(false);
    expect(updateSupplierOrderReceiptSchema.safeParse({}).success).toBe(false);
  });
});
