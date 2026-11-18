import {
  createVariantAttributeSchema,
  updateVariantAttributeSchema,
} from '@/modules/variant-attribute/schemas/variant-attribute.schema';
import {
  createVariantAttributeValueSchema,
  updateVariantAttributeValueSchema,
} from '@/modules/variant-attribute/schemas/variant-attribute-value.schema';
import { z } from '@/shared/libs';
import { generateParamsSchema, paramsIdSchema, smallSerialIdSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const variantAttributeSchemaResponse = openApiRegistry.register(
  'VariantAttributeSchemaResponse',
  z.object({
    id: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
  }),
);

const variantAttributeValueSchemaResponse = openApiRegistry.register(
  'VariantAttributeValueSchemaResponse',
  z.object({
    id: z.number().int(),
    value: z.string(),
  }),
);

const variantAttributeValuesSchemaResponse = openApiRegistry.register(
  'VariantAttributeValuesSchemaResponse',
  z.object({
    attribute: variantAttributeSchemaResponse,
    values: z.array(variantAttributeValueSchemaResponse),
  }),
);

const variantAttributesSchemaResponse = openApiRegistry.register(
  'VariantAttributesSchemaResponse',
  z.array(variantAttributeSchemaResponse),
);

const nullSuccessResponse = {
  description: 'La operación se completó correctamente y la respuesta JSON es null.',
  content: { 'application/json': { schema: z.null() } },
};

const badRequestResponse = apiBadRequestResponse(
  'Solicitud inválida. validationErrors aparece cuando falla la validación Zod; otros errores 400 devuelven message y code si aplica, sin validationErrors.',
);
const serverErrorResponse = apiErrorResponse('Ocurrió un error interno.');
const protectedErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
};
const adminEmployeeErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
};

openApiRegistry.registerPath({
  method: 'get',
  path: '/attributes',
  tags: ['Attributes'],
  summary: 'Listar atributos de variante',
  description: 'Requiere una sesión válida. Devuelve cada atributo con su descripción, si la tiene.',
  security: [{ AccessTokenCookie: [] }],
  responses: {
    200: {
      description: 'Lista de atributos.',
      content: { 'application/json': { schema: variantAttributesSchemaResponse } },
    },
    ...protectedErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/attributes/{id}',
  tags: ['Attributes'],
  summary: 'Consultar un atributo',
  description: 'Requiere una sesión válida.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema },
  responses: {
    200: {
      description: 'Atributo encontrado.',
      content: { 'application/json': { schema: variantAttributeSchemaResponse } },
    },
    400: badRequestResponse,
    ...protectedErrors,
    404: apiErrorResponse('No se encontró el atributo.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/attributes',
  tags: ['Attributes'],
  summary: 'Crear un atributo de variante',
  description: 'Requiere sesión de administrador o empleado.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createVariantAttributeSchema } },
    },
  },
  responses: {
    201: {
      description: 'Atributo creado.',
      content: { 'application/json': { schema: variantAttributeSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    409: apiErrorResponse('Ya existe un atributo con ese nombre.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/attributes/{id}',
  tags: ['Attributes'],
  summary: 'Actualizar un atributo',
  description: 'Requiere sesión de administrador o empleado. Acepta cambios parciales.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsIdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: updateVariantAttributeSchema } },
    },
  },
  responses: {
    200: {
      description: 'Atributo actualizado.',
      content: { 'application/json': { schema: variantAttributeSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el atributo.'),
    409: apiErrorResponse('Ya existe un atributo con ese nombre.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/attributes/{id}',
  tags: ['Attributes'],
  summary: 'Eliminar un atributo',
  description:
    'Requiere sesión de administrador o empleado. La eliminación falla si el atributo todavía tiene valores o está asociado a una variante de producto.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema },
  responses: {
    200: nullSuccessResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el atributo.'),
    409: apiErrorResponse('El atributo tiene valores o está en uso por una variante.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/attributes/{id}/values',
  tags: ['Attributes'],
  summary: 'Listar valores de un atributo',
  description: 'Requiere una sesión válida. Devuelve el atributo y la lista de valores que le pertenecen.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema },
  responses: {
    200: {
      description: 'Atributo consultado y valores asociados.',
      content: { 'application/json': { schema: variantAttributeValuesSchemaResponse } },
    },
    400: badRequestResponse,
    ...protectedErrors,
    404: apiErrorResponse('No se encontró el atributo.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/attributes/{id}/values',
  tags: ['Attributes'],
  summary: 'Crear un valor de atributo',
  description: 'Requiere sesión de administrador o empleado.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsIdSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: createVariantAttributeValueSchema } },
    },
  },
  responses: {
    201: {
      description: 'Valor creado.',
      content: { 'application/json': { schema: variantAttributeValueSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el atributo.'),
    409: apiErrorResponse('Ya existe ese valor para el atributo.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/attributes/{attributeId}/values/{valueId}',
  tags: ['Attributes'],
  summary: 'Actualizar un valor de atributo',
  description: 'Requiere sesión de administrador o empleado. Acepta cambios parciales.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: generateParamsSchema({ attributeId: smallSerialIdSchema, valueId: smallSerialIdSchema }),
    body: {
      required: true,
      content: { 'application/json': { schema: updateVariantAttributeValueSchema } },
    },
  },
  responses: {
    200: {
      description: 'Valor actualizado.',
      content: { 'application/json': { schema: variantAttributeValueSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el atributo o el valor dentro de ese atributo.'),
    409: apiErrorResponse('Ya existe ese valor para el atributo.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/attributes/values/{id}',
  tags: ['Attributes'],
  summary: 'Eliminar un valor de atributo',
  description:
    'Requiere sesión de administrador o empleado. La eliminación falla si el valor está asociado a una variante de producto.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema },
  responses: {
    200: nullSuccessResponse,
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró el valor.'),
    409: apiErrorResponse('El valor está en uso por una variante de producto.'),
    500: serverErrorResponse,
  },
});
