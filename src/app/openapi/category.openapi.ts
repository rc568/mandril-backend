import {
  createCategorySchema,
  deleteCategoryQuerySchema,
  updateCategorySchema,
} from '@/modules/category/schemas/category.schema';
import { z } from '@/shared/libs';
import { paramsIdSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const categorySchemaResponse = openApiRegistry.register(
  'CategorySchemaResponse',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    parentId: z.number().int().nullable(),
  }),
);

const categoriesSchemaResponse = openApiRegistry.register(
  'CategoriesSchemaResponse',
  z.array(categorySchemaResponse),
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
  path: '/categories',
  tags: ['Categories'],
  summary: 'Listar categorías',
  description:
    'Público. Devuelve las categorías con su identificador, nombre, slug e identificador de categoría padre. La consulta incluye también las categorías eliminadas lógicamente.',
  responses: {
    200: {
      description: 'Lista de categorías.',
      content: { 'application/json': { schema: categoriesSchemaResponse } },
    },
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/categories/{id}',
  tags: ['Categories'],
  summary: 'Consultar una categoría',
  description: 'Público. El ID es un identificador numérico serial pequeño.',
  request: { params: paramsIdSchema },
  responses: {
    200: {
      description: 'Categoría encontrada.',
      content: { 'application/json': { schema: categorySchemaResponse } },
    },
    400: badRequestResponse,
    404: apiErrorResponse('No se encontró la categoría.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/categories',
  tags: ['Categories'],
  summary: 'Crear una categoría',
  description: 'Requiere sesión de administrador o empleado. parentId es opcional y permite anidar la categoría.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createCategorySchema } },
    },
  },
  responses: {
    201: {
      description: 'Categoría creada.',
      content: { 'application/json': { schema: categorySchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la categoría padre.'),
    409: apiErrorResponse('Ya existe una categoría con ese slug.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/categories/{id}',
  tags: ['Categories'],
  summary: 'Actualizar una categoría',
  description: 'Requiere sesión de administrador o empleado. Acepta cambios parciales.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsIdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateCategorySchema } },
    },
  },
  responses: {
    200: {
      description: 'Categoría actualizada.',
      content: { 'application/json': { schema: categorySchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la categoría o su categoría padre.'),
    409: apiErrorResponse('El slug ya existe o la categoría no puede ser su propia categoría padre.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/categories/{id}',
  tags: ['Categories'],
  summary: 'Eliminar una categoría',
  description:
    'Requiere sesión de administrador. Realiza una eliminación lógica. Con force=true también marca como eliminados los productos asociados; sin force=true, una categoría con productos activos responde 409.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema, query: deleteCategoryQuerySchema },
  responses: {
    200: nullSuccessResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la categoría.'),
    409: apiErrorResponse('La categoría tiene productos activos y no se indicó force=true.'),
    500: serverErrorResponse,
  },
});
