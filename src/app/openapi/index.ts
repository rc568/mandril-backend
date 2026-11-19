import './auth.openapi';
import './catalog.openapi';
import './category.openapi';
import './client.openapi';
import './inventory.openapi';
import './product.openapi';
import './sales-channel.openapi';
import './variant-attribute.openapi';
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
  tags: [
    { name: 'Auth', description: 'Autenticación, sesiones y usuarios.' },
    { name: 'Attributes', description: 'Atributos y valores para las variantes de productos.' },
    { name: 'Catalogs', description: 'Catálogos y colecciones de productos.' },
    { name: 'Categories', description: 'Categorías y jerarquía de productos.' },
    { name: 'Clients', description: 'Búsqueda de clientes y datos de facturación.' },
    { name: 'Inventory', description: 'Saldos y movimientos de inventario.' },
    { name: 'Products', description: 'Catálogo, variantes e imágenes de productos.' },
    { name: 'Sales channels', description: 'Canales usados para registrar ventas.' },
  ],
});
