import {
  COLD_PRODUCTS_ORDER_BY_OPTIONS,
  PAGINATION_LIMITS,
  PAGINATION_SIZE,
  RANKING_PRODUCTS_ORDER_BY_OPTIONS,
} from '@/modules/stats/domain';
import { z } from '@/shared/libs';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const statsPaginationSchemaResponse = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  nextPage: z.number().int().nullable(),
  prevPage: z.number().int().nullable(),
});

const variantAttributeSchemaResponse = z.object({
  attribute: z.string(),
  value: z.string(),
});

const inventoryStatsSchemaResponse = openApiRegistry.register(
  'InventoryStatsSchemaResponse',
  z.object({
    _metadata: z.object({ date: z.iso.datetime({ offset: true }) }),
    inventory: z.object({
      productsCount: z.string(),
      active: z.string().nullable(),
      nonActive: z.string().nullable(),
      deleted: z.string().nullable(),
      outOfStock: z.string().nullable(),
      totalCapital: z.string(),
      totalRevenue: z.string(),
    }),
  }),
);

const rankingProductSchemaResponse = z.object({
  variantId: z.number().int(),
  code: z.string(),
  productName: z.string(),
  totalQuantitySold: z.string(),
  totalRevenue: z.string(),
  totalProfit: z.string(),
  totalCost: z.string(),
  variantAttributes: z.array(variantAttributeSchemaResponse),
});

const rankingProductsSchemaResponse = openApiRegistry.register(
  'RankingProductsSchemaResponse',
  z.object({
    _metadata: z.object({
      pagination: statsPaginationSchemaResponse,
      date: z.iso.datetime({ offset: true }),
    }),
    rankingProducts: z.array(rankingProductSchemaResponse),
  }),
);

const coldProductSchemaResponse = z.object({
  code: z.string(),
  productName: z.string(),
  currentStock: z.number().int(),
  variantAttributes: z.array(variantAttributeSchemaResponse),
});

const coldProductsEmptySchemaResponse = z.object({
  pagination: statsPaginationSchemaResponse,
  data: z.array(coldProductSchemaResponse).max(0),
});

const coldProductsPopulatedSchemaResponse = z.object({
  _metadata: z.object({
    pagination: statsPaginationSchemaResponse,
    date: z.iso.datetime({ offset: true }),
  }),
  coldProducts: z.array(coldProductSchemaResponse),
});

const coldProductsSchemaResponse = openApiRegistry.register(
  'ColdProductsSchemaResponse',
  z.union([coldProductsEmptySchemaResponse, coldProductsPopulatedSchemaResponse]),
);

const salesSummaryValuesSchemaResponse = z.object({
  ordersCount: z.string(),
  totalRevenue: z.string(),
  totalCost: z.string(),
  totalProfit: z.string(),
  profitMargin: z.string(),
});

const salesChannelSummarySchemaResponse = z.object({
  label: z.string(),
  ordersCount: z.string(),
  totalRevenue: z.string(),
  totalCost: z.string(),
  totalProfit: z.string(),
});

const salesEvolutionPointSchemaResponse = z.object({
  period: z.iso.datetime({ offset: true }),
  ordersCount: z.string(),
  totalRevenue: z.string(),
  totalCost: z.string(),
  totalProfit: z.string(),
  profitMargin: z.string(),
});

const salesSummarySchemaResponse = openApiRegistry.register(
  'SalesSummarySchemaResponse',
  z.object({
    _metadata: z.object({
      view: z.enum(['historical', 'annual', 'monthly', 'range']),
      range: z.object({
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
      }),
      daysDifference: z.number().int().optional(),
    }),
    summary: salesSummaryValuesSchemaResponse,
    distributionChart: z.object({
      key: z.literal('salesChannel'),
      data: z.array(salesChannelSummarySchemaResponse),
    }),
    evolutionChart: z.object({
      unit: z.enum(['year', 'month', 'week', 'day']),
      data: z.array(salesEvolutionPointSchemaResponse),
    }),
  }),
);

const serverErrorResponse = apiErrorResponse('Ocurrió un error interno.');
const adminEmployeeErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
};

// Runtime query validators use intersections, which registerPath cannot accept as route parameters.
const statsPaginationQuerySchemaOpenApi = {
  page: z.number().int().min(1).default(1),
  limit: z
    .number()
    .int()
    .refine((value) => PAGINATION_LIMITS.some((size) => size === value))
    .default(PAGINATION_SIZE)
    .describe(`Cantidad por página: ${PAGINATION_LIMITS.join(', ')}.`),
};

const rankingProductsQuerySchemaOpenApi = z.object({
  view: z.enum(['historical', 'annual', 'monthly']),
  year: z.number().int().min(2020).max(2100).optional().describe('Requerido cuando view es annual o monthly.'),
  month: z.number().int().min(1).max(12).optional().describe('Requerido cuando view es monthly.'),
  ...statsPaginationQuerySchemaOpenApi,
  orderBy: z.enum(RANKING_PRODUCTS_ORDER_BY_OPTIONS).default('revenue_desc'),
});

const coldProductsQuerySchemaOpenApi = z.object({
  orderBy: z.enum(COLD_PRODUCTS_ORDER_BY_OPTIONS).default('name_asc'),
  ...statsPaginationQuerySchemaOpenApi,
});

const salesSummaryQuerySchemaOpenApi = z.object({
  view: z.enum(['historical', 'annual', 'monthly', 'range']),
  year: z.number().int().min(2020).max(2100).optional().describe('Requerido cuando view es annual o monthly.'),
  month: z.number().int().min(1).max(12).optional().describe('Requerido cuando view es monthly.'),
  startDate: z.iso.datetime().optional().describe('Requerido cuando view es range.'),
  endDate: z.iso.datetime().optional().describe('Requerido cuando view es range.'),
  channelId: z.number().int().min(1).optional(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/stats/inventory',
  tags: ['Stats'],
  summary: 'Consultar resumen de inventario',
  description:
    'Requiere sesión de administrador o empleado. Los contadores y valores monetarios agregados se devuelven como strings numéricos. active, nonActive, deleted y outOfStock pueden ser null si no hay variantes.',
  security: [{ AccessTokenCookie: [] }],
  responses: {
    200: {
      description: 'Resumen actual de inventario y fecha de cálculo.',
      content: { 'application/json': { schema: inventoryStatsSchemaResponse } },
    },
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/stats/products/ranking',
  tags: ['Stats'],
  summary: 'Consultar ranking de productos',
  description:
    'Requiere sesión de administrador o empleado. view selecciona el periodo: historical desde el inicio operativo configurado hasta ahora; annual usa el año indicado; monthly usa año y mes. Retornos completados restan cantidades, ingresos, costos y utilidad. page inicia en 1; limit acepta 10, 24 o 48; orderBy admite quantity_asc, quantity_desc, profit_asc, profit_desc, revenue_asc o revenue_desc y por defecto es revenue_desc. Los agregados numéricos se devuelven como strings.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: rankingProductsQuerySchemaOpenApi },
  responses: {
    200: {
      description: 'Productos ordenados según el criterio solicitado, con metadatos de paginación.',
      content: { 'application/json': { schema: rankingProductsSchemaResponse } },
    },
    400: apiBadRequestResponse('Parámetros de periodo, ordenamiento o paginación inválidos.'),
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/stats/products/cold',
  tags: ['Stats'],
  summary: 'Consultar productos sin ventas',
  description:
    'Requiere sesión de administrador o empleado. Devuelve variantes activas sin movimientos en order_products y su saldo AVAILABLE actual. page inicia en 1; limit acepta 10, 24 o 48; orderBy admite name_asc o name_desc y por defecto es name_asc. Si no hay resultados, el backend responde con { pagination, data: [] }; cuando hay resultados responde con { _metadata, coldProducts }.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: coldProductsQuerySchemaOpenApi },
  responses: {
    200: {
      description: 'Productos sin ventas. La forma de la respuesta depende de si existen resultados.',
      content: { 'application/json': { schema: coldProductsSchemaResponse } },
    },
    400: apiBadRequestResponse('Parámetros de ordenamiento o paginación inválidos.'),
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/stats/sales/summary',
  tags: ['Stats'],
  summary: 'Consultar resumen de ventas',
  description:
    'Requiere sesión de administrador o empleado. view admite historical, annual (year), monthly (year y month) o range (startDate y endDate). Solo considera órdenes completadas; los retornos reducen los agregados. channelId filtra summary y evolutionChart; distributionChart conserva el desglose de todos los canales. Los importes, cantidades y margen se devuelven como strings numéricos; profitMargin es una proporción entre 0 y 1, no un porcentaje.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: salesSummaryQuerySchemaOpenApi },
  responses: {
    200: {
      description: 'Resumen de ventas, distribución por canal y serie temporal.',
      content: { 'application/json': { schema: salesSummarySchemaResponse } },
    },
    400: apiBadRequestResponse('Parámetros de periodo o canal inválidos.'),
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});
