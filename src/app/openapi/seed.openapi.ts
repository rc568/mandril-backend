import { z } from '@/shared/libs';
import { apiErrorResponse, openApiRegistry } from './registry';

openApiRegistry.registerPath({
  method: 'get',
  path: '/seed',
  tags: ['Seed'],
  summary: 'Recargar los datos de demostración',
  description:
    'Requiere sesión de administrador o empleado. Esta operación elimina y vuelve a insertar datos de demostración de catálogos, categorías, atributos, productos, imágenes, canales de venta, clientes y órdenes. La operación es transaccional y no debe ejecutarse sobre datos reales.',
  security: [{ AccessTokenCookie: [] }],
  responses: {
    200: {
      description: 'Datos de demostración cargados.',
      content: { 'application/json': { schema: z.literal('executed') } },
    },
    401: apiErrorResponse('Falta una sesión válida.'),
    403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
    500: apiErrorResponse('Ocurrió un error interno.'),
  },
});
