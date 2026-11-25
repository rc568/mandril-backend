import { describe, expect, it } from 'vitest';
import { billingOrderCreateSchema, billingOrderUdpateSchema } from '@/modules/billing/schemas/billing.schema';

const billingIdentity = {
  billingName: 'Cliente de prueba',
  billingReceiptType: 'BOLETA',
  billingDocumentNumberType: 'SIN DOCUMENTO',
} as const;

describe('validación de número de documento en billing', () => {
  it.each([
    ['create', billingOrderCreateSchema, { status: 'PENDING', amount: 100, ...billingIdentity }],
    ['update', billingOrderUdpateSchema, billingIdentity],
  ])('permite omitir billingDocumentNumber al guardar SIN DOCUMENTO (%s)', (_name, schema, input) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it.each([
    ['create', billingOrderCreateSchema, { status: 'PENDING', amount: 100, ...billingIdentity }],
    ['update', billingOrderUdpateSchema, billingIdentity],
  ])('rechaza billingDocumentNumber cuando el tipo es SIN DOCUMENTO (%s)', (_name, schema, input) => {
    const result = schema.safeParse({ ...input, billingDocumentNumber: '12345678' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['billingDocumentNumber'] }));
    }
  });

  it('mantiene obligatorio el número para los tipos de documento que lo requieren', () => {
    const result = billingOrderUdpateSchema.safeParse({
      billingName: 'Cliente de prueba',
      billingReceiptType: 'BOLETA',
      billingDocumentNumberType: 'DNI',
    });

    expect(result.success).toBe(false);
  });

  it('también rechaza una cadena vacía enviada en lugar de omitir el número', () => {
    const result = billingOrderUdpateSchema.safeParse({
      ...billingIdentity,
      billingDocumentNumber: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['billingDocumentNumber'] }));
    }
  });
});
