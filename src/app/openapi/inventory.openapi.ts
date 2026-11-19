import { ADJUSTMENT_BUCKET, INVENTORY_BUCKET, STOCK_MOVEMENT_TYPE } from '@/modules/inventory/domain/constants';
import {
  adjustInventorySchema,
  inventoryBalancesQuerySchema,
  inventoryMovementsQuerySchema,
} from '@/modules/inventory/schemas/inventory.schema';
import { z } from '@/shared/libs';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const inventoryPaginationSchemaResponse = z.object({
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

const inventoryBalanceSchemaResponse = z.object({
  bucket: z.enum(INVENTORY_BUCKET),
  quantity: z.number().int(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedBy: z.uuid().nullable(),
  updatedByName: z.string().nullable(),
});

const inventoryBalanceVariantSchemaResponse = openApiRegistry.register(
  'InventoryBalanceVariantSchemaResponse',
  z.object({
    productVariantId: z.number().int(),
    code: z.string(),
    name: z.string(),
    variantDeletedAt: z.iso.datetime({ offset: true }).nullable(),
    productDeletedAt: z.iso.datetime({ offset: true }).nullable(),
    variantAttributes: z.array(variantAttributeSchemaResponse),
    balances: z.array(inventoryBalanceSchemaResponse),
  }),
);

const inventoryBalancesSchemaResponse = openApiRegistry.register(
  'InventoryBalancesSchemaResponse',
  z.object({
    pagination: inventoryPaginationSchemaResponse,
    variants: z.array(inventoryBalanceVariantSchemaResponse),
  }),
);

const inventoryMovementSchemaResponse = openApiRegistry.register(
  'InventoryMovementSchemaResponse',
  z.object({
    id: z.uuid(),
    productVariantId: z.number().int(),
    type: z.enum(STOCK_MOVEMENT_TYPE),
    quantity: z.number().int(),
    orderId: z.uuid().nullable(),
    purchaseId: z.uuid().nullable(),
    supplierOrderReceiptItemId: z.uuid().nullable(),
    fromBucket: z.enum(INVENTORY_BUCKET).nullable(),
    toBucket: z.enum(INVENTORY_BUCKET).nullable(),
    unitCostPen: z.string().nullable(),
    note: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.uuid(),
    code: z.string(),
    name: z.string(),
    createdByName: z.string().nullable(),
    variantAttributes: z.array(variantAttributeSchemaResponse),
  }),
);

const inventoryMovementsSchemaResponse = openApiRegistry.register(
  'InventoryMovementsSchemaResponse',
  z.object({
    pagination: inventoryPaginationSchemaResponse,
    movements: z.array(inventoryMovementSchemaResponse),
  }),
);

const adjustmentMovementSchemaResponse = z.object({
  id: z.uuid(),
  productVariantId: z.number().int(),
  type: z.literal('ADJUSTMENT'),
  quantity: z.number().int(),
  orderId: z.uuid().nullable(),
  purchaseId: z.uuid().nullable(),
  supplierOrderReceiptItemId: z.uuid().nullable(),
  fromBucket: z.enum(ADJUSTMENT_BUCKET).nullable(),
  toBucket: z.enum(ADJUSTMENT_BUCKET).nullable(),
  unitCostPen: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.uuid(),
});

const inventoryAdjustmentSchemaResponse = openApiRegistry.register(
  'InventoryAdjustmentSchemaResponse',
  z.object({
    previousQuantity: z.number().int(),
    quantity: z.number().int(),
    movement: adjustmentMovementSchemaResponse.nullable(),
  }),
);

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
  path: '/inventory/balances',
  tags: ['Inventory'],
  summary: 'Consultar saldos de inventario',
  description:
    'Requiere sesión de administrador o empleado. page inicia en 1; limit acepta 24, 48, 72 o 96 y por defecto es 48. Permite filtrar por productVariantId, bucket y nombre de producto o código con search. Incluye variantes eliminadas y muestra sus marcas de eliminación. Si falta una fila de saldo, devuelve quantity=0 y campos de auditoría null. Sin filtro bucket, devuelve AVAILABLE, RESERVED, QUARANTINE y DEFECTIVE.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: inventoryBalancesQuerySchema },
  responses: {
    200: {
      description: 'Saldos paginados por variante.',
      content: { 'application/json': { schema: inventoryBalancesSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/inventory/movements',
  tags: ['Inventory'],
  summary: 'Consultar movimientos de inventario',
  description:
    'Requiere sesión de administrador o empleado. Acepta los mismos page y limit de /inventory/balances, además de filtros productVariantId, bucket, search, type, orderId, supplierOrderId, createdBy, start y end. Devuelve el historial más reciente primero, usando el ID como desempate estable. bucket busca coincidencias en origen o destino; start y end son inclusivos, requieren fecha ISO con zona horaria y start no puede ser posterior a end.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: inventoryMovementsQuerySchema },
  responses: {
    200: {
      description: 'Movimientos paginados con datos de variante y usuario creador.',
      content: { 'application/json': { schema: inventoryMovementsSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/inventory/adjustments',
  tags: ['Inventory'],
  summary: 'Ajustar manualmente un saldo',
  description:
    'Requiere sesión de administrador. countedQuantity es el saldo final deseado. bucket admite AVAILABLE, QUARANTINE o DEFECTIVE; RESERVED se administra mediante operaciones de venta. reason queda registrado como nota del movimiento. Si el saldo ya coincide, movement es null y no se crea movimiento.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: adjustInventorySchema } },
    },
  },
  responses: {
    200: {
      description: 'Saldo anterior, nuevo saldo y movimiento creado, si hubo diferencia.',
      content: { 'application/json': { schema: inventoryAdjustmentSchemaResponse } },
    },
    400: badRequestResponse,
    ...adminEmployeeErrors,
    404: apiErrorResponse('No se encontró la variante activa.'),
    500: serverErrorResponse,
  },
});
