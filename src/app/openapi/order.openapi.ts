import { completeOrderSchema, orderQuerySchema, updateOrderSchema } from '@/modules/order/schemas/order.schema';
import { ORDER_PRODUCT_TYPE, ORDER_STATUS, ORDER_TYPE } from '@/modules/order/domain';
import { RETURN_CONDITION } from '@/modules/inventory/domain/constants';
import {
  BILLING_STATUS,
  CLIENT_DOCUMENT_NUMBER_TYPE,
  DOCUMENT_NUMBER_TYPE,
  RECEIPT_TYPE,
} from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType, paramsUuidv4IdSchema, phoneNumberSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const orderVariantAttributeSchemaResponse = z.object({
  value: z.string(),
  valueId: z.number().int(),
  attribute: z.string(),
  attributeId: z.number().int(),
});

const orderReturnConditionSchemaResponse = z.object({
  condition: z.enum(RETURN_CONDITION),
  quantity: z.number().int(),
});

const orderProductSchemaResponse = z.object({
  id: z.uuid(),
  returnConditions: z.array(orderReturnConditionSchemaResponse),
  code: z.string(),
  name: z.string(),
  type: z.enum(ORDER_PRODUCT_TYPE),
  price: z.string(),
  purchasePrice: z.string(),
  quantity: z.number().int(),
  variantId: z.number().int(),
  variantAttributes: z.array(orderVariantAttributeSchemaResponse),
});

const orderClientSchemaResponse = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  phoneNumber1: z.string().nullable(),
  contactName: z.string().nullable(),
  documentNumber: z.string().nullable(),
  documentNumberType: z.enum(CLIENT_DOCUMENT_NUMBER_TYPE).nullable(),
});

const orderBillingSchemaResponse = z.object({
  id: z.uuid(),
  code: z.string().nullable(),
  status: z.enum(BILLING_STATUS),
  billingReceiptType: z.enum(RECEIPT_TYPE),
  billingDocumentNumber: z.string().nullable(),
  billingDocumentNumberType: z.enum(DOCUMENT_NUMBER_TYPE),
  billingName: z.string(),
  amount: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.string(),
});

const orderSchemaResponse = openApiRegistry.register(
  'OrderSchemaResponse',
  z.object({
    id: z.uuid(),
    type: z.enum(ORDER_TYPE),
    status: z.enum(ORDER_STATUS),
    relatedOrderId: z.uuid().nullable(),
    observation: z.string().nullable(),
    totalSale: z.string(),
    totalCost: z.string(),
    numProducts: z.number().int(),
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.string(),
    client: orderClientSchemaResponse,
    channel: z.string(),
    products: z.array(orderProductSchemaResponse),
    billing: z.array(orderBillingSchemaResponse),
  }),
);

const orderPaginationSchemaResponse = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  nextPage: z.number().int().nullable(),
  prevPage: z.number().int().nullable(),
});

const ordersSchemaResponse = openApiRegistry.register(
  'OrdersSchemaResponse',
  z.object({
    pagination: orderPaginationSchemaResponse,
    orders: z.array(orderSchemaResponse),
  }),
);

const nullSuccessResponse = {
  description: 'La operación se completó correctamente y la respuesta JSON es null.',
  content: { 'application/json': { schema: z.null() } },
};

const badRequestResponse = apiBadRequestResponse(
  'Solicitud inválida. validationErrors aparece cuando falla la validación Zod; otros errores 400 devuelven message y code si aplica, sin validationErrors.',
);
const serverErrorResponse = apiErrorResponse('Ocurrió un error interno.');
const adminEmployeeErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
};

// The runtime create schema uses z.undefined() to forbid type-inapplicable fields; OpenAPI has no undefined type.
const orderLineCreateSchemaOpenApi = z.discriminatedUnion('type', [
  z.object({
    variantId: z.number().int().positive(),
    type: z.literal('SALE'),
    price: z.number().min(0),
    quantity: z.number().int().min(1),
  }),
  z.object({
    variantId: z.number().int().positive(),
    type: z.literal('RETURN'),
    quantity: z.number().int().min(1),
  }),
]);

const saleOrderLineCreateSchemaOpenApi = z.object({
  variantId: z.number().int().positive(),
  type: z.literal('SALE'),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
});

const returnOrderLineCreateSchemaOpenApi = z.object({
  variantId: z.number().int().positive(),
  type: z.literal('RETURN'),
  quantity: z.number().int().min(1),
});

const saleClientCreateSchemaOpenApi = z.object({
  contactName: baseStringType.max(255).optional(),
  email: z.email().max(255).optional(),
  phoneNumber1: phoneNumberSchema.optional(),
  phoneNumber2: phoneNumberSchema.optional(),
  documentNumberType: z.enum(CLIENT_DOCUMENT_NUMBER_TYPE).optional(),
  documentNumber: baseStringType.max(25).optional(),
});

const saleOrderCreateSchemaOpenApi = z.object({
  salesChannelId: z.number().int().positive(),
  status: z.enum(['PENDING', 'PAID', 'COMPLETED']).default('PENDING'),
  observation: baseStringType.optional(),
  products: z.array(saleOrderLineCreateSchemaOpenApi).nonempty(),
  type: z.literal('SALE'),
  client: saleClientCreateSchemaOpenApi,
});

const exchangeOrderCreateSchemaOpenApi = z.object({
  salesChannelId: z.number().int().positive(),
  status: z.literal('PENDING').default('PENDING'),
  observation: baseStringType.optional(),
  products: z.array(orderLineCreateSchemaOpenApi).nonempty(),
  type: z.literal('EXCHANGE'),
  relatedOrderId: z.uuidv4(),
});

const fullReturnOrderCreateSchemaOpenApi = z.object({
  salesChannelId: z.number().int().positive(),
  status: z.literal('PENDING').default('PENDING'),
  observation: baseStringType.optional(),
  type: z.literal('RETURN'),
  relatedOrderId: z.uuidv4(),
  fullReturn: z.literal(true),
});

const partialReturnOrderCreateSchemaOpenApi = z.object({
  salesChannelId: z.number().int().positive(),
  status: z.literal('PENDING').default('PENDING'),
  observation: baseStringType.optional(),
  products: z.array(returnOrderLineCreateSchemaOpenApi).nonempty(),
  type: z.literal('RETURN'),
  relatedOrderId: z.uuidv4(),
  fullReturn: z.literal(false),
});

const returnOrderCreateSchemaOpenApi = z.discriminatedUnion('fullReturn', [
  fullReturnOrderCreateSchemaOpenApi,
  partialReturnOrderCreateSchemaOpenApi,
]);

const createOrderSchemaOpenApi = z.discriminatedUnion('type', [
  saleOrderCreateSchemaOpenApi,
  exchangeOrderCreateSchemaOpenApi,
  returnOrderCreateSchemaOpenApi,
]);

openApiRegistry.registerPath({
  method: 'get',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Listar órdenes',
  description:
    'Requiere sesión de administrador o empleado. page inicia en 1; limit acepta 24, 48, 72 o 96 y por defecto es 48. Permite filtrar por fechas, canal, estado, comprobante, estado de facturación y texto. El orden por defecto es fecha descendente; sortBy también admite date_asc, total_sale_asc y total_sale_desc.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: orderQuerySchema },
  responses: {
    200: {
      description: 'Órdenes paginadas con productos, cliente y comprobantes de facturación.',
      content: { 'application/json': { schema: ordersSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Consultar una orden',
  description: 'Requiere sesión de administrador o empleado. El ID debe ser UUID v4.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Orden con productos, datos del cliente y facturación asociada.',
      content: { 'application/json': { schema: orderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Crear una orden',
  description:
    'Requiere sesión de administrador o empleado. El cuerpo distingue SALE, EXCHANGE y RETURN. SALE crea o asocia un cliente y admite líneas SALE. EXCHANGE y RETURN requieren relatedOrderId y quedan PENDING; una devolución completa usa fullReturn=true y omite products, mientras que una parcial envía líneas RETURN. Los importes de las respuestas se serializan como strings.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      description:
        'Cada línea SALE requiere price; cada línea RETURN no lo acepta. Las variantes no se pueden repetir, salvo en EXCHANGE, donde una misma variante puede aparecer una vez como SALE y otra como RETURN. El backend valida stock disponible y que las devoluciones correspondan a cantidades aún retornables de la orden original.',
      content: { 'application/json': { schema: createOrderSchemaOpenApi } },
    },
  },
  responses: {
    201: {
      description: 'Orden creada con sus líneas, totales y cliente.',
      content: { 'application/json': { schema: orderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el canal, variante o la orden relacionada.'),
    409: apiErrorResponse('No hay stock suficiente o la orden relacionada no permite esta operación.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Actualizar una orden',
  description:
    'Requiere sesión de administrador o empleado. Solo las órdenes SALE que no estén completadas ni canceladas permiten cambiar cliente, productos, canal u otros datos. El estado se puede ajustar entre PENDING y PAID; una orden completada no se modifica por esta ruta.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: {
      required: true,
      description:
        'Los campos son parciales. Si se envían productos, deben ser líneas SALE sin variantes duplicadas y el arreglo define las líneas finales de la orden.',
      content: { 'application/json': { schema: updateOrderSchema } },
    },
  },
  responses: {
    200: {
      description: 'Orden actualizada.',
      content: { 'application/json': { schema: orderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden o el canal indicado.'),
    409: apiErrorResponse('El estado de la orden impide esta actualización o no hay stock suficiente.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/orders/{id}/cancel',
  tags: ['Orders'],
  summary: 'Cancelar una orden',
  description:
    'Requiere sesión de administrador o empleado. Libera reservas si se trata de una venta. No se pueden cancelar órdenes completadas ni cancelar dos veces.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Orden cancelada.',
      content: { 'application/json': { schema: orderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden.'),
    409: apiErrorResponse('La orden ya fue cancelada o está completada.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/orders/{id}/complete',
  tags: ['Orders'],
  summary: 'Completar una orden',
  description:
    'Requiere sesión de administrador o empleado. Las ventas entregan las unidades reservadas. Para RETURN o EXCHANGE, items distribuye cada línea retornada entre AVAILABLE, QUARANTINE o DEFECTIVE; si se omite, todas las unidades retornadas se asignan a AVAILABLE.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: {
      required: false,
      description:
        'Para cada línea RETURN, la suma de quantity debe coincidir con la cantidad de esa línea. No repitas una combinación de orderProductId y condition. No envíes items al completar una venta.',
      content: { 'application/json': { schema: completeOrderSchema } },
    },
  },
  responses: {
    200: {
      description: 'Orden completada con las condiciones de devolución reflejadas en sus productos.',
      content: { 'application/json': { schema: orderSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden o variante.'),
    409: apiErrorResponse('El estado, stock o cantidad retornable impide completar la orden.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Eliminar una orden cancelada',
  description:
    'Requiere sesión de administrador o empleado. Realiza una eliminación lógica; primero se debe cancelar la orden.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: nullSuccessResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la orden.'),
    409: apiErrorResponse('La orden debe estar CANCELLED antes de eliminarse.'),
    500: serverErrorResponse,
  },
});
