import {
  createCatalogSchema,
  deleteCatalogQuerySchema,
  updateCatalogSchema,
} from '@/modules/catalog/schemas/catalog.schema';
import { z } from '@/shared/libs';
import { paramsIdSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const catalogSchemaResponse = openApiRegistry.register(
  'CatalogSchemaResponse',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
  }),
);

const catalogsSchemaResponse = openApiRegistry.register(
  'CatalogsSchemaResponse',
  z.array(catalogSchemaResponse),
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
  path: '/catalogs',
  tags: ['Catalogs'],
  summary: 'Listar catálogos',
  description: 'Público. Devuelve los catálogos con su identificador, nombre y slug, incluidos los eliminados lógicamente.',
  responses: {
    200: {
      description: 'Lista de catálogos.',
      content: { 'application/json': { schema: catalogsSchemaResponse } },
    },
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/catalogs/{id}',
  tags: ['Catalogs'],
  summary: 'Consultar un catálogo',
  description: 'Público. El ID es un identificador numérico serial pequeño.',
  request: { params: paramsIdSchema },
  responses: {
    200: {
      description: 'Catálogo encontrado.',
      content: { 'application/json': { schema: catalogSchemaResponse } },
    },
    400: badRequestResponse,
    404: apiErrorResponse('No se encontró el catálogo.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/catalogs',
  tags: ['Catalogs'],
  summary: 'Crear un catálogo',
  description: 'Requiere sesión de administrador o empleado.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createCatalogSchema } },
    },
  },
  responses: {
    201: {
      description: 'Catálogo creado.',
      content: { 'application/json': { schema: catalogSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    409: apiErrorResponse('Ya existe un catálogo con ese slug.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/catalogs/{id}',
  tags: ['Catalogs'],
  summary: 'Actualizar un catálogo',
  description:
    'Requiere sesión de administrador o empleado. Acepta cambios parciales. La implementación actual responde sin cuerpo para esta operación.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsIdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateCatalogSchema } },
    },
  },
  responses: {
    200: { description: 'Catálogo actualizado; la respuesta no contiene cuerpo.' },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el catálogo.'),
    409: apiErrorResponse('Ya existe un catálogo con ese slug.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/catalogs/{id}',
  tags: ['Catalogs'],
  summary: 'Eliminar un catálogo',
  description:
    'Requiere sesión de administrador. Realiza una eliminación lógica. Con force=true también marca como eliminados los productos asociados; sin force=true, un catálogo con productos activos responde 409.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema, query: deleteCatalogQuerySchema },
  responses: {
    200: nullSuccessResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el catálogo.'),
    409: apiErrorResponse('El catálogo tiene productos activos y no se indicó force=true.'),
    500: serverErrorResponse,
  },
});
