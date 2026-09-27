import { describe, expect, it } from 'vitest';
import {
  createSupplierSchema,
  getSuppliersQuerySchema,
  updateSupplierSchema,
} from '@/modules/supplier-order/schemas/supplier.schema';
import {
  createSupplierOrderSchema,
  getSupplierOrdersQuerySchema,
  supplierOrderProductSchema,
  updateSupplierOrderSchema,
} from '@/modules/supplier-order/schemas/supplier-order.schema';
import {
  createSupplierOrderExpenseSchema,
  supplierOrderExpenseParamsSchema,
  supplierOrderExpensesParamsSchema,
  updateSupplierOrderExpenseSchema,
} from '@/modules/supplier-order/schemas/supplier-order-expense.schema';
import { errorMessages } from '@/shared/domain';

const supplierId = 'd0a0e793-9a24-4bd3-8c08-f808f62d4f87';
const lineId = '0f8d5184-68c4-42df-a1dd-481b9a5625d7';
const product = () => ({ productVariantId: 1, type: 'PURCHASE', quantityOrdered: 10, unitPrice: 21.25 });
const order = () => ({ supplierId, currency: 'USD', supplierPaymentAmount: 250, products: [product()] });
const expense = () => ({ type: 'LOCAL_FREIGHT', amountUsd: 44, amountPen: 154 });

describe('proveedores', () => {
  it('normaliza el nombre y activa al proveedor al crearlo', () => {
    expect(createSupplierSchema.parse({ name: '  Proveedor  ' })).toEqual({ name: 'Proveedor', isActive: true });
  });

  it('no introduce valores por defecto al editar y permite limpiar la descripción', () => {
    expect(updateSupplierSchema.parse({ description: null })).toEqual({ description: null });
    expect(updateSupplierSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it.each(['', '   ', 'a'.repeat(256)])('rechaza un nombre inválido', (name) => {
    expect(createSupplierSchema.safeParse({ name }).success).toBe(false);
  });

  it('distingue proveedores inactivos de la ausencia de filtro', () => {
    expect(getSuppliersQuerySchema.parse({ isActive: 'false' })).toEqual({ isActive: false });
    expect(getSuppliersQuerySchema.parse({})).toEqual({});
    expect(getSuppliersQuerySchema.safeParse({ isActive: 'yes' }).success).toBe(false);
  });
});

describe('compras y líneas', () => {
  it('crea una compra sin gastos ni campos calculados y convierte los importes', () => {
    const result = createSupplierOrderSchema.parse(order());
    expect(result.type).toBe('PURCHASE');
    expect(result.supplierPaymentAmount).toBe('250.000000');
    expect(result.products[0].unitPrice).toBe('21.250000');
    expect(result).not.toHaveProperty('expenses');
    expect(result).not.toHaveProperty('projectedExchangeRate');
  });

  it.each(['expenses', 'status', 'recordOrigin', 'arrivalDateLegacy', 'costCalculationVersion', 'createdBy'])(
    'rechaza %s en la creación general',
    (field) => {
      expect(createSupplierOrderSchema.safeParse({ ...order(), [field]: [] }).success).toBe(false);
    },
  );

  it('rechaza gastos en una edición general incluso junto con campos válidos', () => {
    expect(updateSupplierOrderSchema.safeParse({ observation: 'Nueva nota', expenses: [] }).success).toBe(false);
  });

  it('permite comprar y recibir compensaciones de la misma variante', () => {
    const input = { ...order(), products: [product(), { ...product(), type: 'COMPENSATION', unitPrice: 0 }] };
    expect(createSupplierOrderSchema.safeParse(input).success).toBe(true);
    expect(createSupplierOrderSchema.safeParse({ ...input, type: 'COMPENSATION' }).success).toBe(false);
    const compensation = { ...input, type: 'COMPENSATION', supplierPaymentAmount: 0, products: [input.products[1]] };
    expect(createSupplierOrderSchema.safeParse(compensation).success).toBe(true);
    expect(createSupplierOrderSchema.safeParse({ ...compensation, type: 'PURCHASE' }).success).toBe(false);
  });

  it('rechaza un precio cobrado en una línea compensatoria', () => {
    const result = supplierOrderProductSchema.safeParse({ ...product(), type: 'COMPENSATION', unitPrice: 1 });
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['unitPrice'],
          message: errorMessages.supplierOrder.compensationPriceMustBeZero,
        }),
      ]),
    );
  });

  it.each([
    { unitPrice: -1 },
    { unitPrice: 0.0000001 },
    { unitPrice: 1.0000001 },
    { unitPrice: 1000000 },
    { unitPrice: Number.NaN },
    { unitPrice: Number.POSITIVE_INFINITY },
    { unitPrice: '21.25' },
    { quantityOrdered: 0 },
    { quantityOrdered: -1 },
    { quantityOrdered: 1.5 },
    { quantityOrdered: 2147483648 },
    { productVariantId: 32768 },
    { productVariantId: 1.5 },
  ])('rechaza datos inválidos sin lanzar excepciones: %j', (changes) => {
    expect(supplierOrderProductSchema.safeParse({ ...product(), ...changes }).success).toBe(false);
  });

  it('valida el límite del subtotal con precisión de seis decimales', () => {
    expect(
      supplierOrderProductSchema.safeParse({ ...product(), quantityOrdered: 3, unitPrice: 333333.333333 }).success,
    ).toBe(true);
    const result = supplierOrderProductSchema.safeParse({ ...product(), quantityOrdered: 3, unitPrice: 333333.333334 });
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: errorMessages.supplierOrder.subtotalTooLarge })]),
    );
    expect(supplierOrderProductSchema.parse({ ...product(), quantityOrdered: 1, unitPrice: 0.000001 }).unitPrice).toBe(
      '0.000001',
    );
  });

  it('rechaza compras sin líneas y distingue moneda de tipo de cambio proyectado', () => {
    expect(createSupplierOrderSchema.safeParse({ ...order(), products: [] }).success).toBe(false);
    expect(createSupplierOrderSchema.safeParse({ ...order(), currency: 'EUR' }).success).toBe(false);
    expect(createSupplierOrderSchema.safeParse({ ...order(), projectedExchangeRate: 0 }).success).toBe(false);
    expect(createSupplierOrderSchema.parse({ ...order(), projectedExchangeRate: 3.8 }).projectedExchangeRate).toBe(
      '3.800000',
    );
  });

  it('permite ediciones parciales y rechaza identificadores de línea repetidos', () => {
    expect(updateSupplierOrderSchema.parse({ trackingNumber: null })).toEqual({ trackingNumber: null });
    expect(updateSupplierOrderSchema.safeParse({}).success).toBe(false);
    expect(updateSupplierOrderSchema.safeParse({ products: [] }).success).toBe(false);
    const existing = { ...product(), id: lineId };
    expect(updateSupplierOrderSchema.safeParse({ products: [existing, existing] }).success).toBe(false);
    expect(updateSupplierOrderSchema.safeParse({ products: [existing, product()] }).success).toBe(true);
  });

  it('valida los filtros con los enums compartidos', () => {
    expect(getSupplierOrdersQuerySchema.parse({ supplierId, status: 'PARTIALLY_RECEIVED', page: '2' })).toMatchObject({
      supplierId,
      status: 'PARTIALLY_RECEIVED',
      page: 2,
    });
    expect(getSupplierOrdersQuerySchema.safeParse({ status: 'En camino' }).success).toBe(false);
  });
});

describe('gastos independientes', () => {
  it('conserva ambos importes sin aplicar el tipo proyectado y permite incluirlos en el pago al proveedor', () => {
    expect(createSupplierOrderExpenseSchema.parse({ ...expense(), includedInSupplierPayment: true })).toEqual({
      type: 'LOCAL_FREIGHT',
      amountUsd: '44.000000',
      amountPen: '154.000000',
      includedInSupplierPayment: true,
    });
  });

  it.each([{ amountUsd: 44 }, { amountPen: 154 }, { amountUsd: null, amountPen: 154 }])(
    'admite un equivalente pendiente: %j',
    (amounts) => {
      expect(
        createSupplierOrderExpenseSchema.parse({ type: 'LOCAL_FREIGHT', ...amounts }).includedInSupplierPayment,
      ).toBe(false);
    },
  );

  it.each([
    { type: 'LOCAL_FREIGHT' },
    { type: 'LOCAL_FREIGHT', amountUsd: null, amountPen: null },
    { ...expense(), amountUsd: 0 },
    { ...expense(), amountPen: -1 },
    { ...expense(), amountUsd: 1.1234567 },
    { ...expense(), amountUsd: 0.0000001 },
    { ...expense(), amountPen: 1000000 },
    { ...expense(), type: 'OTHER' },
    { ...expense(), type: 'OTHER', description: '   ' },
    { ...expense(), currency: 'USD' },
    { ...expense(), orderId: supplierId },
  ])('rechaza un gasto inválido: %j', (input) => {
    expect(createSupplierOrderExpenseSchema.safeParse(input).success).toBe(false);
  });

  it('exige una descripción para gastos adicionales', () => {
    expect(
      createSupplierOrderExpenseSchema.parse({ type: 'OTHER', description: ' Permiso ', amountPen: 10 }).description,
    ).toBe('Permiso');
  });

  it('PATCH no agrega defaults ni exige reenviar campos existentes', () => {
    expect(updateSupplierOrderExpenseSchema.parse({ amountPen: 160 })).toEqual({ amountPen: '160.000000' });
    expect(updateSupplierOrderExpenseSchema.parse({ includedInSupplierPayment: false })).toEqual({
      includedInSupplierPayment: false,
    });
    expect(updateSupplierOrderExpenseSchema.parse({ amountUsd: null })).toEqual({ amountUsd: null });
    expect(updateSupplierOrderExpenseSchema.parse({ type: 'OTHER' })).toEqual({ type: 'OTHER' });
  });

  it.each([{}, { id: lineId }, { amountUsd: null, amountPen: null }, { type: 'OTHER', description: null }])(
    'rechaza un PATCH incoherente: %j',
    (input) => {
      expect(updateSupplierOrderExpenseSchema.safeParse(input).success).toBe(false);
    },
  );

  it('la validación completa detecta inconsistencias que dependen de campos guardados', () => {
    const input = { amountUsd: null };
    expect(updateSupplierOrderExpenseSchema.safeParse(input).success).toBe(true);
    const existing = { type: 'LOCAL_FREIGHT', amountUsd: 44 };
    expect(createSupplierOrderExpenseSchema.safeParse({ ...existing, ...input }).success).toBe(false);
    expect(createSupplierOrderExpenseSchema.safeParse({ ...expense(), ...input }).success).toBe(true);
  });

  it('toma los identificadores del path para crear, editar y eliminar', () => {
    expect(supplierOrderExpensesParamsSchema.parse({ orderId: supplierId })).toEqual({ orderId: supplierId });
    expect(supplierOrderExpenseParamsSchema.safeParse({ orderId: supplierId, expenseId: lineId }).success).toBe(true);
    expect(supplierOrderExpenseParamsSchema.safeParse({ orderId: supplierId, expenseId: 'invalid' }).success).toBe(
      false,
    );
    expect(supplierOrderExpenseParamsSchema.safeParse({ expenseId: lineId }).success).toBe(false);
  });
});
