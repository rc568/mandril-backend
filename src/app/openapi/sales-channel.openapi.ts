import {
  createSaleChannelSchema,
  deleteSaleChannelQuerySchema,
  updateSaleChannelSchema,
} from '@/modules/sales-channel/schemas/sales-channel.schema';
import { z } from '@/shared/libs';
import { paramsIdSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const salesChannelSchemaResponse = openApiRegistry.register(
  'SalesChannelSchemaResponse',
  z.object({
    id: z.number().int(),
    channel: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.uuid(),
  }),
);

const salesChannelsSchemaResponse = openApiRegistry.register(
  'SalesChannelsSchemaResponse',
  z.array(salesChannelSchemaResponse),
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

openApiRegistry.registerPath({
  method: 'get',
  path: '/sales-channel',
  tags: ['Sales channels'],
  summary: 'Listar canales de venta',
  description:
    'Requiere sesión de administrador o empleado. Devuelve hasta 50 canales que no estén eliminados lógicamente.',
  security: [{ AccessTokenCookie: [] }],
  responses: {
    200: {
      description: 'Lista de canales de venta.',
      content: { 'application/json': { schema: salesChannelsSchemaResponse } },
    },
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/sales-channel/{id}',
  tags: ['Sales channels'],
  summary: 'Consultar un canal de venta',
  description: 'Requiere sesión de administrador o empleado.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema },
  responses: {
    200: {
      description: 'Canal de venta encontrado.',
      content: { 'application/json': { schema: salesChannelSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el canal de venta activo.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/sales-channel',
  tags: ['Sales channels'],
  summary: 'Crear un canal de venta',
  description: 'Requiere sesión de administrador o empleado.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createSaleChannelSchema } },
    },
  },
  responses: {
    201: {
      description: 'Canal de venta creado.',
      content: { 'application/json': { schema: salesChannelSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    409: apiErrorResponse('Ya existe un canal con ese nombre.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/sales-channel/{id}',
  tags: ['Sales channels'],
  summary: 'Actualizar un canal de venta',
  description: 'Requiere sesión de administrador o empleado. Acepta cambios parciales.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsIdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateSaleChannelSchema } },
    },
  },
  responses: {
    200: {
      description: 'Canal de venta actualizado.',
      content: { 'application/json': { schema: salesChannelSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el canal de venta activo.'),
    409: apiErrorResponse('Ya existe un canal con ese nombre.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/sales-channel/{id}',
  tags: ['Sales channels'],
  summary: 'Eliminar un canal de venta',
  description:
    'Requiere sesión de administrador. force es una cadena booleana. Con force=true, el canal se marca como eliminado. Sin force=true, si existen órdenes activas responde 409; si no existen, la implementación actual responde null sin marcar el canal como eliminado.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema, query: deleteSaleChannelQuerySchema },
  responses: {
    200: nullSuccessResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el canal de venta activo.'),
    409: apiErrorResponse('El canal tiene órdenes activas. code: SALES_CHANNEL_HAS_ACTIVE_ORDERS.'),
    500: serverErrorResponse,
  },
});
