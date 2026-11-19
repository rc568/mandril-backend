import { billingOrderUdpateSchema, issueBillingSchema } from '@/modules/billing/schemas/billing.schema';
import { BILLING_STATUS, DOCUMENT_NUMBER_TYPE, RECEIPT_TYPE } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType, paramsUuidv4IdSchema, uuidV4Schema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const billingOrderSchemaResponse = openApiRegistry.register(
  'BillingOrderSchemaResponse',
  z.object({
    id: z.uuid(),
    code: z.string().nullable(),
    amount: z.string(),
    status: z.enum(BILLING_STATUS),
    billingName: z.string(),
    billingReceiptType: z.enum(RECEIPT_TYPE),
    billingDocumentNumberType: z.enum(DOCUMENT_NUMBER_TYPE),
    billingDocumentNumber: z.string().nullable(),
  }),
);

const billingOrderCreateSchemaOpenApi = z.discriminatedUnion('billingReceiptType', [
  z.object({
    status: z.enum(['PENDING', 'ISSUED']),
    amount: z.number().positive(),
    billingName: baseStringType.max(255),
    billingAddress: baseStringType.max(255).optional(),
    note: baseStringType.max(600).optional(),
    code: z.string().optional(),
    billingReceiptType: z.literal('FACTURA'),
    billingDocumentNumberType: z.literal('RUC'),
    billingDocumentNumber: z.string().regex(/^\d{11}$/),
  }),
  z.object({
    status: z.enum(['PENDING', 'ISSUED']),
    amount: z.number().positive(),
    billingName: baseStringType.max(255),
    billingAddress: baseStringType.max(255).optional(),
    note: baseStringType.max(600).optional(),
    code: z.string().optional(),
    billingReceiptType: z.literal('BOLETA'),
    billingDocumentNumberType: z.enum(DOCUMENT_NUMBER_TYPE.filter((type) => type !== 'RUC')),
    billingDocumentNumber: baseStringType.max(25).optional(),
  }),
]);

const billingErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
};
const badRequestResponse = apiBadRequestResponse(
  'Solicitud inválida. validationErrors aparece cuando falla la validación Zod; los errores de negocio 400 devuelven message y code si aplica, sin validationErrors.',
);
const serverErrorResponse = apiErrorResponse('Ocurrió un error interno.');

openApiRegistry.registerPath({
  method: 'post',
  path: '/orders/{orderId}/billing',
  tags: ['Billing'],
  summary: 'Crear un comprobante para una orden',
  description:
    'Requiere sesión de administrador o empleado. Solo se pueden facturar órdenes PAID o COMPLETED y una orden no puede tener más de un comprobante PENDING. FACTURA requiere RUC de 11 dígitos; BOLETA admite otros tipos de documento. Si status es ISSUED, code debe seguir el formato de la serie del comprobante; si es PENDING, code debe omitirse.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: z.object({ orderId: uuidV4Schema }),
    body: {
      required: true,
      content: { 'application/json': { schema: billingOrderCreateSchemaOpenApi } },
    },
  },
  responses: {
    201: {
      description: 'Comprobante creado.',
      content: { 'application/json': { schema: billingOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...billingErrors,
    404: apiErrorResponse('No se encontró la orden.'),
    409: apiErrorResponse('La orden aún no se puede facturar, ya tiene un comprobante pendiente o el código está duplicado.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/billing/{id}',
  tags: ['Billing'],
  summary: 'Actualizar un comprobante pendiente',
  description:
    'Requiere sesión de administrador o empleado. Solo se puede actualizar un comprobante PENDING. Los campos de identidad del comprobante (billingName, billingReceiptType, billingDocumentNumberType y billingDocumentNumber) deben enviarse juntos.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: billingOrderUdpateSchema } },
    },
  },
  responses: {
    200: {
      description: 'Comprobante actualizado.',
      content: { 'application/json': { schema: billingOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...billingErrors,
    404: apiErrorResponse('No se encontró el comprobante.'),
    409: apiErrorResponse('El comprobante no está PENDING o los campos de identidad están incompletos.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/billing/{id}/issue',
  tags: ['Billing'],
  summary: 'Emitir un comprobante',
  description:
    'Requiere sesión de administrador o empleado. Asigna el estado ISSUED y valida el formato del código según el tipo de comprobante: E001-0001 para FACTURA y EB01-0001 para BOLETA.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: issueBillingSchema } },
    },
  },
  responses: {
    200: {
      description: 'Comprobante emitido.',
      content: { 'application/json': { schema: billingOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...billingErrors,
    404: apiErrorResponse('No se encontró el comprobante.'),
    409: apiErrorResponse('El comprobante ya fue emitido o está anulado.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/billing/{id}/void',
  tags: ['Billing'],
  summary: 'Anular un comprobante emitido',
  description: 'Requiere sesión de administrador o empleado. Solo se pueden anular comprobantes ISSUED.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Comprobante anulado.',
      content: { 'application/json': { schema: billingOrderSchemaResponse } },
    },
    400: badRequestResponse,
    ...billingErrors,
    404: apiErrorResponse('No se encontró el comprobante.'),
    409: apiErrorResponse('El comprobante debe estar ISSUED para anularse.'),
    500: serverErrorResponse,
  },
});
