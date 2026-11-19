import {
  createSupplierOrderExpenseSchema,
  supplierOrderExpenseParamsSchema,
  supplierOrderExpensesParamsSchema,
  updateSupplierOrderExpenseSchema,
} from '@/modules/supplier-order/schemas/supplier-order-expense.schema';
import {
  createSupplierOrderReceiptSchema,
  reviewSupplierOrderReceiptSchema,
  supplierOrderReceiptParamsSchema,
  supplierOrderReceiptsParamsSchema,
} from '@/modules/supplier-order/schemas/supplier-order-receipt.schema';
import {
  createSupplierOrderSchema,
  supplierOrderActionSchema,
  updateProjectedExchangeRateSchema,
  updateSupplierOrderSchema,
} from '@/modules/supplier-order/schemas/supplier-order.schema';
import {
  SUPPLIER_ORDER_CURRENCY,
  SUPPLIER_ORDER_EXPENSE_TYPE,
  SUPPLIER_ORDER_RECORD_ORIGIN,
  SUPPLIER_ORDER_RECEIPT_REVIEW_STATUS,
  SUPPLIER_ORDER_REVIEW_STATUS,
  SUPPLIER_ORDER_STATUS,
  SUPPLIER_ORDER_TYPE,
} from '@/modules/supplier-order/domain';
import { z } from '@/shared/libs';
import { baseStringType, paramsUuidv4IdSchema, uuidV4Schema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const supplierOrderBaseSchemaResponse = z.object({
  id: z.uuid(),
  supplierId: z.uuid(),
  type: z.enum(SUPPLIER_ORDER_TYPE),
  status: z.enum(SUPPLIER_ORDER_STATUS),
  reviewStatus: z.enum(SUPPLIER_ORDER_REVIEW_STATUS).nullable(),
  recordOrigin: z.enum(SUPPLIER_ORDER_RECORD_ORIGIN),
  trackingNumber: z.string().nullable(),
  importPolicy: z.string().nullable(),
  arrivalDateLegacy: z.iso.date().nullable(),
  currency: z.enum(SUPPLIER_ORDER_CURRENCY).nullable(),
  includesIgv: z.boolean(),
  supplierPaymentAmount: z.string().nullable(),
  projectedExchangeRate: z.string().nullable(),
  costCalculationVersion: z.string(),
  observation: z.string().nullable(),
  receivingClosedAt: z.iso.datetime({ offset: true }).nullable(),
  receivingClosedBy: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  createdBy: z.uuid(),
  updatedBy: z.uuid().nullable(),
});

const supplierOrderSupplierSchemaResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
});

const supplierOrderProductVariantSchemaResponse = z.object({
  id: z.number().int(),
  code: z.string(),
  isActive: z.boolean().nullable(),
  deletedAt: z.iso.datetime({ offset: true }).nullable(),
  productParent: z.object({ id: z.number().int(), name: z.string() }),
});

const supplierOrderProductSchemaResponse = z.object({
  id: z.uuid(),
  supplierOrderId: z.uuid(),
  productVariantId: z.number().int(),
  type: z.enum(SUPPLIER_ORDER_TYPE),
  quantityOrdered: z.number().int(),
  unitPrice: z.string().nullable(),
  subtotalPrice: z.string().nullable(),
  calculatedUnitCost: z.string().nullable(),
  calculatedUnitCostPen: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  createdBy: z.uuid(),
  updatedBy: z.uuid().nullable(),
  productVariant: supplierOrderProductVariantSchemaResponse,
});

const supplierOrderExpenseSchemaResponse = z.object({
  id: z.uuid(),
  supplierOrderId: z.uuid(),
  type: z.enum(SUPPLIER_ORDER_EXPENSE_TYPE),
  description: z.string().nullable(),
  amountUsd: z.string().nullable(),
  amountPen: z.string().nullable(),
  includedInSupplierPayment: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  createdBy: z.uuid(),
  updatedBy: z.uuid().nullable(),
});

const supplierOrderSchemaResponse = openApiRegistry.register(
  'SupplierOrderSchemaResponse',
  supplierOrderBaseSchemaResponse.extend({
    supplier: supplierOrderSupplierSchemaResponse,
    products: z.array(supplierOrderProductSchemaResponse),
    expenses: z.array(supplierOrderExpenseSchemaResponse),
  }),
);

const supplierOrderPageSchemaResponse = openApiRegistry.register(
  'SupplierOrderPageSchemaResponse',
  z.object({
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      totalItems: z.number().int(),
      totalPages: z.number().int(),
      nextPage: z.number().int().nullable(),
      prevPage: z.number().int().nullable(),
    }),
    orders: z.array(supplierOrderSchemaResponse),
  }),
);

const supplierOrderExpenseOnlySchemaResponse = openApiRegistry.register(
  'SupplierOrderExpenseSchemaResponse',
  supplierOrderExpenseSchemaResponse,
);

const supplierOrderReceiptBaseSchemaResponse = z.object({
  id: z.uuid(),
  supplierOrderId: z.uuid(),
  sequenceNumber: z.number().int(),
  receivedAt: z.iso.datetime({ offset: true }),
  receivedBy: z.uuid(),
  reviewStatus: z.enum(SUPPLIER_ORDER_RECEIPT_REVIEW_STATUS),
  reviewedAt: z.iso.datetime({ offset: true }).nullable(),
  reviewedBy: z.uuid().nullable(),
  observation: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  createdBy: z.uuid(),
  updatedBy: z.uuid().nullable(),
});

const supplierOrderReceiptItemSchemaResponse = z.object({
  id: z.uuid(),
  receiptId: z.uuid(),
  supplierOrderProductId: z.uuid().nullable(),
  productVariantId: z.number().int(),
  availableQuantity: z.number().int(),
  defectiveQuantity: z.number().int(),
  sourceIssueId: z.uuid().nullable(),
  unplannedUnitCostPen: z.string().nullable(),
  observation: z.string().nullable(),
});

const supplierOrderReceiptSchemaResponse = openApiRegistry.register(
  'SupplierOrderReceiptSchemaResponse',
  supplierOrderReceiptBaseSchemaResponse.extend({ inventoryPosted: z.boolean() }),
);

const supplierOrderReceiptWithItemsSchemaResponse = openApiRegistry.register(
  'SupplierOrderReceiptWithItemsSchemaResponse',
  supplierOrderReceiptBaseSchemaResponse.extend({
    inventoryPosted: z.boolean(),
    items: z.array(supplierOrderReceiptItemSchemaResponse),
  }),
);

const supplierOrderReceiptReviewSchemaResponse = openApiRegistry.register(
  'SupplierOrderReceiptReviewSchemaResponse',
  supplierOrderReceiptBaseSchemaResponse.extend({ items: z.array(supplierOrderReceiptItemSchemaResponse) }),
);

const supplierOrderCostsSchemaResponse = openApiRegistry.register(
  'SupplierOrderCostsSchemaResponse',
  z.array(
    z.object({
      supplierOrderProductId: z.uuid(),
      calculatedUnitCost: z.string(),
      calculatedUnitCostPen: z.string().nullable(),
    }),
  ),
);

const inventoryPostingSchemaResponse = z.object({ receiptId: z.uuid(), inventoryPosted: z.literal(true) });

const supplierOrderQuerySchemaOpenApi = z.object({
  page: z.string().optional().describe('Página solicitada; por defecto 1.'),
  limit: z.string().optional().describe('Tamaño de página: 24, 48, 72 o 96. Por defecto 48.'),
  supplierId: uuidV4Schema.optional(),
  type: z.enum(SUPPLIER_ORDER_TYPE).optional(),
  status: z.enum(SUPPLIER_ORDER_STATUS).optional(),
  reviewStatus: z.enum(SUPPLIER_ORDER_REVIEW_STATUS).optional(),
  currency: z.enum(SUPPLIER_ORDER_CURRENCY).optional(),
  search: baseStringType.optional().describe('Busca en proveedor, trackingNumber, importPolicy y observation.'),
});

const badRequestResponse = apiBadRequestResponse(
  'Solicitud inválida. validationErrors aparece cuando falla la validación Zod; otros errores 400 devuelven message y code si aplica, sin validationErrors.',
);
const serverErrorResponse = apiErrorResponse('Ocurrió un error interno.');
const adminEmployeeErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
};
const notFoundOrderResponse = apiErrorResponse('No se encontró la orden de compra.');
const orderEditableConflict = apiErrorResponse('La orden no está en un estado que permita esta operación.');
const orderRowResponse = {
  description: 'Orden de compra actualizada.',
  content: { 'application/json': { schema: supplierOrderBaseSchemaResponse } },
};

openApiRegistry.registerPath({
  method: 'get',
  path: '/supplier-orders',
  tags: ['Supplier orders'],
  summary: 'Listar órdenes de compra',
  description:
    'Requiere sesión de administrador o empleado. Ordena por fecha de creación descendente. Filtra por proveedor, tipo, estado, estado de revisión, moneda y texto.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: supplierOrderQuerySchemaOpenApi },
  responses: {
    200: {
      description: 'Órdenes de compra paginadas con proveedor, productos y gastos.',
      content: { 'application/json': { schema: supplierOrderPageSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/supplier-orders/{id}',
  tags: ['Supplier orders'],
  summary: 'Consultar una orden de compra',
  description: 'Requiere sesión de administrador o empleado. El ID debe ser UUID v4.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Orden de compra con proveedor, líneas de producto y gastos.',
      content: { 'application/json': { schema: supplierOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders',
  tags: ['Supplier orders'],
  summary: 'Crear una orden de compra',
  description:
    'Requiere sesión de administrador o empleado. type por defecto es PURCHASE e includesIgv por defecto es false. Una compra requiere al menos una línea PURCHASE; una compensación solo puede contener líneas COMPENSATION. Los importes de las respuestas se serializan como strings.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createSupplierOrderSchema } },
    },
  },
  responses: {
    201: {
      description: 'Orden de compra creada.',
      content: { 'application/json': { schema: supplierOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el proveedor o alguna variante.'),
    409: apiErrorResponse('El proveedor está inactivo o la combinación de datos no es válida.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/supplier-orders/{id}',
  tags: ['Supplier orders'],
  summary: 'Actualizar una orden de compra',
  description:
    'Requiere sesión de administrador o empleado. Solo permite editar órdenes PREPARING o IN_TRANSIT. Si se envían products, el arreglo reemplaza las líneas existentes; incluye id para conservar una línea existente. Cambiar currency también requiere enviar products y supplierPaymentAmount.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: { required: true, content: { 'application/json': { schema: updateSupplierOrderSchema } } },
  },
  responses: {
    200: {
      description: 'Orden de compra actualizada.',
      content: { 'application/json': { schema: supplierOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden, proveedor o variante.'),
    409: apiErrorResponse('El estado o los movimientos de inventario impiden editar esta orden.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{id}/in-transit',
  tags: ['Supplier orders'],
  summary: 'Marcar una orden como enviada',
  description: 'Requiere sesión de administrador o empleado. Solo se puede cambiar de PREPARING a IN_TRANSIT.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Orden marcada IN_TRANSIT.',
      content: { 'application/json': { schema: supplierOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: orderEditableConflict,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{id}/cancel',
  tags: ['Supplier orders'],
  summary: 'Cancelar una orden de compra',
  description: 'Requiere sesión de administrador o empleado. Solo se pueden cancelar órdenes PREPARING o IN_TRANSIT.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Orden cancelada.',
      content: { 'application/json': { schema: supplierOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: orderEditableConflict,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/supplier-orders/{id}/projected-exchange-rate',
  tags: ['Supplier orders'],
  summary: 'Actualizar el tipo de cambio proyectado',
  description:
    'Requiere sesión de administrador o empleado. projectedExchangeRate puede ser null para quitarlo; una orden USD necesita un tipo de cambio antes de calcular y registrar costos finales. No permite órdenes CANCELLED ni importadas como LEGACY_IMPORT.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateProjectedExchangeRateSchema } },
    },
  },
  responses: {
    200: {
      description: 'Tipo de cambio actualizado.',
      content: { 'application/json': { schema: supplierOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: apiErrorResponse('El origen o el estado de la orden, o movimientos ya registrados, impiden cambiar el tipo de cambio.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{orderId}/expenses',
  tags: ['Supplier orders'],
  summary: 'Agregar un gasto a una orden de compra',
  description:
    'Requiere sesión de administrador o empleado. Solo se pueden modificar gastos mientras la orden esté PREPARING o IN_TRANSIT. OTHER requiere descripción y se debe proporcionar amountUsd o amountPen.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderExpensesParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: createSupplierOrderExpenseSchema } },
    },
  },
  responses: {
    201: {
      description: 'Gasto agregado.',
      content: { 'application/json': { schema: supplierOrderExpenseOnlySchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: orderEditableConflict,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/supplier-orders/{orderId}/expenses/{expenseId}',
  tags: ['Supplier orders'],
  summary: 'Actualizar un gasto',
  description:
    'Requiere sesión de administrador o empleado. Acepta cambios parciales y solo permite editar gastos de órdenes PREPARING o IN_TRANSIT. amountUsd o amountPen debe permanecer definido; OTHER requiere descripción.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderExpenseParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateSupplierOrderExpenseSchema } },
    },
  },
  responses: {
    200: {
      description: 'Gasto actualizado.',
      content: { 'application/json': { schema: supplierOrderExpenseOnlySchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden o el gasto.'),
    409: orderEditableConflict,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/supplier-orders/{orderId}/expenses/{expenseId}',
  tags: ['Supplier orders'],
  summary: 'Eliminar un gasto',
  description: 'Requiere sesión de administrador o empleado. Solo permite eliminar gastos de órdenes PREPARING o IN_TRANSIT.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: supplierOrderExpenseParamsSchema },
  responses: {
    200: {
      description: 'Gasto eliminado; la respuesta JSON es null.',
      content: { 'application/json': { schema: z.null() } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden o el gasto.'),
    409: orderEditableConflict,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/supplier-orders/{orderId}/receipts',
  tags: ['Supplier orders'],
  summary: 'Listar recepciones de una orden',
  description: 'Requiere sesión de administrador o empleado. inventoryPosted indica si la recepción ya generó movimientos de inventario.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: supplierOrderReceiptsParamsSchema },
  responses: {
    200: {
      description: 'Recepciones ordenadas por número de secuencia.',
      content: { 'application/json': { schema: z.array(supplierOrderReceiptSchemaResponse) } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/supplier-orders/{orderId}/receipts/{receiptId}',
  tags: ['Supplier orders'],
  summary: 'Consultar una recepción',
  description: 'Requiere sesión de administrador o empleado. Incluye sus líneas e indica si ya se ingresó a inventario.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: supplierOrderReceiptParamsSchema },
  responses: {
    200: {
      description: 'Recepción con las cantidades disponibles y defectuosas.',
      content: { 'application/json': { schema: supplierOrderReceiptWithItemsSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden o la recepción.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{orderId}/receipts',
  tags: ['Supplier orders'],
  summary: 'Registrar una recepción',
  description:
    'Requiere sesión de administrador o empleado. El cuerpo es opcional; si se omite receivedAt, se usa la fecha actual. El backend asigna el número de secuencia y deja la recepción PENDING de revisión.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderReceiptsParamsSchema,
    body: {
      required: false,
      content: { 'application/json': { schema: createSupplierOrderReceiptSchema } },
    },
  },
  responses: {
    201: {
      description: 'Recepción creada.',
      content: { 'application/json': { schema: supplierOrderReceiptBaseSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: apiErrorResponse('La orden no permite recibir, faltan datos de gastos/moneda o se agotó la secuencia de recepción.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{orderId}/receipts/{receiptId}/review',
  tags: ['Supplier orders'],
  summary: 'Revisar las líneas de una recepción',
  description:
    'Requiere sesión de administrador o empleado. Envía el paquete completo de líneas; cada línea debe tener availableQuantity o defectiveQuantity mayor que cero. Las cantidades acumuladas no pueden superar las pedidas. Las recepciones inesperadas requieren observación y las compensaciones deben referenciar una incidencia abierta del mismo proveedor.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderReceiptParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: reviewSupplierOrderReceiptSchema } },
    },
  },
  responses: {
    200: {
      description: 'Recepción revisada con las líneas guardadas.',
      content: { 'application/json': { schema: supplierOrderReceiptReviewSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden, la recepción o una variante/incidencia.'),
    409: apiErrorResponse('El estado de la orden/recepción, las cantidades o la referencia de compensación no permiten esta revisión.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{orderId}/receipts/{receiptId}/post-to-inventory',
  tags: ['Supplier orders'],
  summary: 'Ingresar una recepción al inventario',
  description:
    'Requiere sesión de administrador o empleado. El cuerpo es opcional y solo admite un objeto vacío. Requiere recepción revisada y costos finales disponibles; crea movimientos para unidades disponibles y defectuosas.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderReceiptParamsSchema,
    body: {
      required: false,
      content: { 'application/json': { schema: supplierOrderActionSchema } },
    },
  },
  responses: {
    200: {
      description: 'Recepción ingresada al inventario.',
      content: { 'application/json': { schema: inventoryPostingSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden, recepción o costo de origen.'),
    409: apiErrorResponse('La recepción aún no se puede ingresar o no se pudo resolver un costo final.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{orderId}/close-receiving',
  tags: ['Supplier orders'],
  summary: 'Cerrar la recepción de una orden',
  description:
    'Requiere sesión de administrador o empleado. El cuerpo es opcional y solo admite un objeto vacío. La orden pasa a RECEIVED; debe estar PARTIALLY_RECEIVED y tener al menos una recepción.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderReceiptsParamsSchema,
    body: {
      required: false,
      content: { 'application/json': { schema: supplierOrderActionSchema } },
    },
  },
  responses: {
    200: orderRowResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: apiErrorResponse('La orden no tiene recepciones para cerrar o su origen/estado no permite cerrar la recepción.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/supplier-orders/{orderId}/calculate-costs',
  tags: ['Supplier orders'],
  summary: 'Calcular costos finales de productos',
  description:
    'Requiere sesión de administrador o empleado. El cuerpo es opcional y solo admite un objeto vacío. Calcula y guarda el costo unitario en la moneda de compra y su equivalente en PEN; se requiere una compra del sistema recibida parcialmente o cerrada, con moneda y tipo de cambio USD definidos.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: supplierOrderReceiptsParamsSchema,
    body: {
      required: false,
      content: { 'application/json': { schema: supplierOrderActionSchema } },
    },
  },
  responses: {
    200: {
      description: 'Costos calculados por línea de producto PURCHASE.',
      content: { 'application/json': { schema: supplierOrderCostsSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: notFoundOrderResponse,
    409: apiErrorResponse('La orden no está lista, ya ingresó a inventario o faltan datos para convertir los costos.'),
    500: serverErrorResponse,
  },
});
