import {
  createProductSchema,
  getAllProductQuerySchema,
  getByIdentifierParams,
  getSearchProductVariantsQuery,
  organizeProductImagesSchema,
  updateProductSchema,
} from '@/modules/product/schemas/product.schema';
import { z } from '@/shared/libs';
import { generateParamsSchema, paramsIdSchema, smallSerialIdSchema } from '@/shared/validators';
import { apiBadRequestResponse, apiErrorResponse, openApiRegistry } from './registry';

const imageSchema = openApiRegistry.register(
  'ProductImage',
  z.object({
    id: z.uuid().describe('Identificador UUID de la imagen.'),
    imageUrl: z.string().describe('URL pública de la imagen convertida a WebP.'),
    position: z.number().int().describe('Posición de la imagen dentro de la variante, comenzando en 1.'),
    isPrimary: z.boolean().describe('Indica si esta es la imagen principal de la variante.'),
  }),
);

const variantAttributeSchema = openApiRegistry.register(
  'ProductVariantAttribute',
  z.object({
    value: z.string(),
    valueId: z.number().int(),
    attribute: z.string(),
    attributeId: z.number().int(),
  }),
);

const productVariantSchema = openApiRegistry.register(
  'ProductVariant',
  z.object({
    id: z.number().int(),
    code: z.string(),
    price: z.string().describe('Precio como decimal serializado en texto con seis decimales.'),
    purchasePrice: z.string().describe('Precio de compra como decimal serializado en texto con seis decimales.'),
    availableQuantity: z.number().int(),
    warrantyMonths: z.number().int().nullable(),
    lengthCm: z.string().nullable(),
    widthCm: z.string().nullable(),
    heightCm: z.string().nullable(),
    weightGrams: z.string().nullable(),
    packageLengthCm: z.string().nullable(),
    packageWidthCm: z.string().nullable(),
    packageHeightCm: z.string().nullable(),
    stockAlertThreshold: z.number().int().nullable(),
    offerPrice: z.string().nullable(),
    offerStartsAt: z.iso.datetime({ offset: true }).nullable(),
    offerEndsAt: z.iso.datetime({ offset: true }).nullable(),
    isOfferActive: z.boolean(),
    isActive: z.boolean(),
    images: z.array(imageSchema),
    variantAttributes: z.array(variantAttributeSchema),
  }),
);

const productSchema = openApiRegistry.register(
  'Product',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.string(),
    category: z.object({ id: z.number().int(), name: z.string(), slug: z.string() }),
    catalog: z.object({ id: z.number().int(), name: z.string(), slug: z.string() }),
    attributes: z.array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        description: z.string().nullable(),
      }),
    ),
    productVariant: z.array(productVariantSchema),
  }),
);

const productPaginationSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  nextPage: z.number().int().nullable(),
  prevPage: z.number().int().nullable(),
});

const productsResponseSchema = openApiRegistry.register(
  'ProductsResponse',
  z.object({
    pagination: productPaginationSchema,
    products: z.array(productSchema),
  }),
);

const productVariantSearchItemSchema = openApiRegistry.register(
  'ProductVariantSearchItem',
  z.object({
    variantId: z.number().int(),
    code: z.string(),
    availableQuantity: z.number().int(),
    purchasePrice: z.string(),
    price: z.string(),
    offerPrice: z.string().nullable(),
    offerStartsAt: z.iso.datetime({ offset: true }).nullable(),
    offerEndsAt: z.iso.datetime({ offset: true }).nullable(),
    isOfferActive: z.boolean(),
    name: z.string(),
    variantAttributes: z.array(variantAttributeSchema),
  }),
);

const productVariantSearchResponseSchema = openApiRegistry.register(
  'ProductVariantSearchResponse',
  z.object({
    products: z.array(productVariantSearchItemSchema),
    pagination: z.object({
      limit: z.number().int(),
      nextOffset: z.number().int().nullable(),
    }),
  }),
);

const imageArrayResponseSchema = z.array(imageSchema);
const nullResponse = {
  description: 'La operación se completó correctamente y la respuesta JSON es null.',
  content: { 'application/json': { schema: z.null() } },
};

const validationErrorResponse = apiBadRequestResponse(
  'Solicitud inválida. validationErrors aparece cuando falla la validación Zod; otros errores 400 devuelven message y code si aplica, sin validationErrors.',
);
const serverErrorResponse = apiErrorResponse('Ocurrió un error interno.');
const authErrors = {
  401: apiErrorResponse('Falta una sesión válida.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación.'),
};

openApiRegistry.registerPath({
  method: 'get',
  path: '/products',
  tags: ['Products'],
  summary: 'Listar productos',
  description:
    'Público. Devuelve productos con sus variantes, atributos e imágenes, además de metadatos de paginación. page inicia en 1; limit acepta 24, 48, 72 o 96 y por defecto es 48. orderBy admite name_asc o name_desc; por defecto ordena por nombre ascendente. Los precios y medidas decimales de cada variante se devuelven como strings.',
  request: { query: getAllProductQuerySchema },
  responses: {
    200: {
      description: 'Lista paginada de productos.',
      content: { 'application/json': { schema: productsResponseSchema } },
    },
    400: validationErrorResponse,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/products/variants/search',
  tags: ['Products'],
  summary: 'Buscar variantes de producto',
  description:
    'Requiere sesión de administrador o empleado. Busca por nombre de producto o código de variante y pagina mediante offset, que por defecto es 0. limit acepta 10, 20 o 40; por defecto es 20. Los campos de precio se devuelven como strings.',
  security: [{ AccessTokenCookie: [] }],
  request: { query: getSearchProductVariantsQuery },
  responses: {
    200: {
      description: 'Variantes encontradas y datos para continuar la paginación.',
      content: { 'application/json': { schema: productVariantSearchResponseSchema } },
    },
    400: validationErrorResponse,
    ...authErrors,
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/products/{identifier}',
  tags: ['Products'],
  summary: 'Consultar un producto',
  description: 'Público. El identificador puede ser el ID numérico o el slug del producto.',
  request: { params: getByIdentifierParams },
  responses: {
    200: {
      description: 'Producto con variantes, atributos e imágenes.',
      content: { 'application/json': { schema: productSchema } },
    },
    400: validationErrorResponse,
    404: apiErrorResponse('No se encontró el producto.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/products',
  tags: ['Products'],
  summary: 'Crear un producto',
  description:
    'Requiere sesión de administrador o empleado. Incluye al menos una variante. Los precios y medidas se envían como números; el backend los almacena con precisión decimal.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      description:
        'Si se envía offerPrice, también se requieren offerStartsAt y offerEndsAt; el precio de oferta debe ser menor que price y la fecha final posterior a la inicial. Si se envía attributesId, cada variante debe incluir todos esos atributos una sola vez y las combinaciones deben ser únicas; se requieren al menos dos variantes. Sin atributos, se permite una sola variante sin attributes.',
      content: { 'application/json': { schema: createProductSchema } },
    },
  },
  responses: {
    201: {
      description: 'Producto creado. Devuelve el producto completo directamente.',
      content: { 'application/json': { schema: productSchema } },
    },
    400: validationErrorResponse,
    ...authErrors,
    404: apiErrorResponse('No se encontró la categoría, catálogo o atributo indicado.'),
    409: apiErrorResponse('El slug, código o combinación de atributos entra en conflicto.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'Actualizar un producto',
  description:
    'Requiere sesión de administrador o empleado. Acepta campos parciales; si se envían variantes, representan el conjunto que quedará activo tras la actualización.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: paramsIdSchema,
    body: {
      required: true,
      description:
        'Si se envía variants, ese arreglo define el conjunto completo de variantes que quedará activo; incluye variantId para actualizar una existente. Si el producto ya usa atributos, conserva attributesId y envía sus combinaciones en variants. Las reglas de oferta son las mismas que al crear.',
      content: { 'application/json': { schema: updateProductSchema } },
    },
  },
  responses: {
    200: {
      description: 'Producto actualizado. Devuelve el producto completo directamente.',
      content: { 'application/json': { schema: productSchema } },
    },
    400: validationErrorResponse,
    ...authErrors,
    404: apiErrorResponse('No se encontró el producto, variante o atributo indicado.'),
    409: apiErrorResponse('La actualización entra en conflicto con el slug, atributos o variantes existentes.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'Eliminar un producto',
  description: 'Requiere sesión de administrador. Realiza una eliminación lógica del producto y sus variantes.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsIdSchema },
  responses: {
    200: nullResponse,
    400: validationErrorResponse,
    ...authErrors,
    404: apiErrorResponse('No se encontró el producto.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/products/{id}/variant/{variantId}',
  tags: ['Products'],
  summary: 'Eliminar una variante',
  description:
    'Requiere sesión de administrador. Realiza una eliminación lógica; no permite eliminar la última variante del producto.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: generateParamsSchema({ id: smallSerialIdSchema, variantId: smallSerialIdSchema }) },
  responses: {
    200: nullResponse,
    400: validationErrorResponse,
    ...authErrors,
    404: apiErrorResponse('No se encontró el producto o la variante.'),
    409: apiErrorResponse('No se puede eliminar la última variante del producto.'),
    500: serverErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/products/{id}/variants/{variantId}/images',
  tags: ['Products'],
  summary: 'Cargar una imagen de variante',
  description:
    'Requiere sesión de administrador o empleado. Envía un único archivo en multipart/form-data con el campo image; admite JPEG, PNG o WebP sin animación, de hasta 5 MiB y 20 megapíxeles. El backend lo convierte a WebP con una dimensión máxima de 1600 píxeles. Máximo 10 imágenes por variante y 2 cargas simultáneas por proceso.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: generateParamsSchema({ id: smallSerialIdSchema, variantId: smallSerialIdSchema }),
    body: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              image: { type: 'string', format: 'binary', description: 'Archivo de imagen.' },
            },
            required: ['image'],
            additionalProperties: false,
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Imagen cargada. La primera imagen de una variante se marca como principal.',
      content: { 'application/json': { schema: imageSchema } },
    },
    400: validationErrorResponse,
    ...authErrors,
    404: apiErrorResponse('No se encontró la variante dentro del producto.'),
    409: apiErrorResponse('La variante alcanzó el límite de imágenes o hubo un conflicto al guardar.'),
    413: apiErrorResponse('El archivo supera el límite de 5 MiB.'),
    429: apiErrorResponse('Hay demasiadas cargas activas. Reintenta cuando alguna termine.'),
    500: serverErrorResponse,
    503: apiErrorResponse('El almacenamiento de imágenes no está configurado.'),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/products/{id}/variants/{variantId}/images',
  tags: ['Products'],
  summary: 'Ordenar las imágenes de una variante',
  description:
    'Requiere sesión de administrador o empleado. Envía todos los UUID de imagen actuales una sola vez, en el orden deseado, y elige como principal uno de ellos.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    params: generateParamsSchema({ id: smallSerialIdSchema, variantId: smallSerialIdSchema }),
    body: {
      required: true,
      content: { 'application/json': { schema: organizeProductImagesSchema } },
    },
  },
  responses: {
    200: {
      description: 'Imágenes en el nuevo orden. Cada elemento incluye su posición y si es principal.',
      content: { 'application/json': { schema: imageArrayResponseSchema } },
    },
    400: validationErrorResponse,
    ...authErrors,
    404: apiErrorResponse('No se encontró la variante dentro del producto.'),
    409: apiErrorResponse('La lista no contiene exactamente las imágenes actuales de esa variante.'),
    500: serverErrorResponse,
  },
});
