import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { openApiRegistry } from './registry';

export const openApiDocument = new OpenApiGeneratorV31(openApiRegistry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'Mandril Backend API',
    version: '1.0.0',
    description:
      'Contrato HTTP del backend Mandril. Las respuestas exitosas devuelven el dato directamente; los errores devuelven un objeto con message y, cuando aplica, code y validationErrors.',
  },
  servers: [{ url: '/api', description: 'API del backend' }],
  tags: [{ name: 'Auth', description: 'Autenticación, sesiones y usuarios.' }],
});
