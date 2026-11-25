import { describe, expect, it } from 'vitest';
import { updateOrderSchema } from '@/modules/order/schemas/order.schema';

describe('validación del documento del cliente al actualizar una orden', () => {
  it('permite seleccionar SIN DOCUMENTO omitiendo el número', () => {
    const result = updateOrderSchema.safeParse({
      client: { documentNumberType: 'SIN DOCUMENTO' },
    });

    expect(result.success).toBe(true);
  });

  it('rechaza un número enviado junto con SIN DOCUMENTO', () => {
    const result = updateOrderSchema.safeParse({
      client: { documentNumberType: 'SIN DOCUMENTO', documentNumber: '12345678' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['client', 'documentNumber'] }));
    }
  });

  it('sigue exigiendo el número para los tipos de documento que lo requieren', () => {
    const result = updateOrderSchema.safeParse({
      client: { documentNumberType: 'DNI' },
    });

    expect(result.success).toBe(false);
  });
});
