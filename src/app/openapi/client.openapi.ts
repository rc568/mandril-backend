import { CLIENT_DOCUMENT_NUMBER_TYPE, DOCUMENT_NUMBER_TYPE, RECEIPT_TYPE } from '@/shared/domain';
import { z } from '@/shared/libs';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const clientSearchItemSchemaResponse = openApiRegistry.register(
  'ClientSearchItemSchemaResponse',
  z.object({
    clientId: z.uuid(),
    documentNumberType: z.enum(CLIENT_DOCUMENT_NUMBER_TYPE).nullable(),
    documentNumber: z.string().nullable(),
    contactName: z.string().nullable(),
    email: z.string().nullable(),
    phoneNumber1: z.string().nullable(),
    phoneNumber2: z.string().nullable(),
    billingName: z.string(),
    billingReceiptType: z.enum(RECEIPT_TYPE),
    billingDocumentNumberType: z.enum(DOCUMENT_NUMBER_TYPE),
    billingDocumentNumber: z.string().nullable(),
  }),
);

const clientSearchSchemaResponse = openApiRegistry.register(
  'ClientSearchSchemaResponse',
  z.object({ clients: z.array(clientSearchItemSchemaResponse) }),
);

openApiRegistry.registerPath({
  method: 'get',
  path: '/clients/search',
  tags: ['Clients'],
  summary: 'Buscar clientes',
  description:
    'Requiere sesión de administrador o empleado. Busca por documento, nombre de contacto, teléfono o datos de facturación; devuelve como máximo 10 resultados distintos. Si q se omite o contiene solo espacios, devuelve una lista vacía.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    query: z.object({ q: z.string().optional() }),
  },
  responses: {
    200: {
      description: 'Clientes que coinciden con la búsqueda y sus datos de facturación.',
      content: { 'application/json': { schema: clientSearchSchemaResponse } },
    },
    400: apiBadRequestResponse('El parámetro q debe aparecer una sola vez y ser texto.'),
    401: apiErrorResponse('Falta una sesión válida.'),
    403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
    500: apiErrorResponse('Ocurrió un error interno.'),
  },
});
