import {
  createSupplierSchema,
  updateSupplierSchema,
} from '@/modules/supplier-order/schemas/supplier.schema';
import { z } from '@/shared/libs';
import { baseStringType, paramsUuidv4IdSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const supplierSchemaResponse = openApiRegistry.register(
  'SupplierSchemaResponse',
  z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }).nullable(),
    createdBy: z.uuid(),
    updatedBy: z.uuid().nullable(),
  }),
);

const supplierPaginationSchemaResponse = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  nextPage: z.number().int().nullable(),
  prevPage: z.number().int().nullable(),
});

const supplierListSchemaResponse = openApiRegistry.register(
  'SupplierListSchemaResponse',
  z.object({
    pagination: supplierPaginationSchemaResponse,
    suppliers: z.array(supplierSchemaResponse),
  }),
);

const supplierQuerySchemaOpenApi = z.object({
  page: z.string().optional().describe('Página solicitada. Si se omite o no es un entero positivo, se usa 1.'),
  limit: z.string().optional().describe('Tamaño de página: 24, 48, 72 o 96. Por defecto se usa 48.'),
  search: baseStringType.optional().describe('Filtra por coincidencia parcial del nombre.'),
  isActive: z.enum(['true', 'false']).optional().describe('Filtra por estado activo.'),
});

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
  path: '/suppliers',
  tags: ['Suppliers'],
  summary: 'Listar proveedores',
  description:
    'Requiere sesión de administrador o empleado. Devuelve los proveedores ordenados por nombre y con paginación. El filtro de texto se aplica al nombre y se interpreta literalmente.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: supplierQuerySchemaOpenApi },
  responses: {
    200: {
      description: 'Proveedores paginados.',
      content: { 'application/json': { schema: supplierListSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/suppliers/{id}',
  tags: ['Suppliers'],
  summary: 'Consultar un proveedor',
  description: 'Requiere sesión de administrador o empleado. El ID debe ser UUID v4.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: {
      description: 'Proveedor encontrado.',
      content: { 'application/json': { schema: supplierSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el proveedor.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/suppliers',
  tags: ['Suppliers'],
  summary: 'Crear un proveedor',
  description: 'Requiere sesión de administrador o empleado. isActive es opcional y por defecto es true.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createSupplierSchema } },
    },
  },
  responses: {
    201: {
      description: 'Proveedor creado.',
      content: { 'application/json': { schema: supplierSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/suppliers/{id}',
  tags: ['Suppliers'],
  summary: 'Actualizar un proveedor',
  description: 'Requiere sesión de administrador o empleado. Acepta campos parciales; el ID debe ser UUID v4.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsUuidv4IdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateSupplierSchema } },
    },
  },
  responses: {
    200: {
      description: 'Proveedor actualizado.',
      content: { 'application/json': { schema: supplierSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el proveedor.'),
    500: serverErrorResponse,
  },
});
