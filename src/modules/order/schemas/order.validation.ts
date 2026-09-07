import type { z } from 'zod';
import { errorMessages } from '@/shared/domain';
import type { OrderCreateDto, OrderUpdateDto } from './order.schema';

type OrderValidation =
  | {
      ctx: z.core.ParsePayload<OrderCreateDto>;
      isUpdate: false;
    }
  | {
      ctx: z.core.ParsePayload<OrderUpdateDto>;
      isUpdate: true;
    };

export const orderValidation = (params: OrderValidation) => {
  const { client, products } = params.ctx.value;

  if (products && products.length > 0) {
    const uniqueProducts = new Set(products.map((p) => p.variantId));
    if (uniqueProducts.size !== products.length) {
      params.ctx.issues.push({
        code: 'custom',
        input: products,
        message: errorMessages.order.duplicatedProducts,
        path: ['products'],
      });
    }
  }

  if (!params.isUpdate) {
    const { type, products, fullReturn } = params.ctx.value;

    // Check products logic only when products needs to be present
    if (type !== 'RETURN' || (type === 'RETURN' && fullReturn === false)) {
      const typeOrderProductsSet = new Set(products.map((p) => p.type));

      if (type === 'EXCHANGE') {
        if (typeOrderProductsSet.size !== 2) {
          params.ctx.issues.push({
            code: 'custom',
            input: params.ctx.value.products,
            message: errorMessages.order.invalidProductsTypeForExchangeOrder,
            path: ['products', 'type'],
          });
        }
      } else {
        if (!typeOrderProductsSet.has(type)) {
          params.ctx.issues.push({
            code: 'custom',
            input: params.ctx.value.products,
            message:
              type === 'SALE'
                ? errorMessages.order.invalidProductsTypeForSaleOrder
                : errorMessages.order.invalidProductsTypeForReturnOrder,
            path: ['products', 'type'],
          });
        }
      }
    }
  }

  if (client) {
    if (Object.keys(client).length === 0) {
      params.ctx.issues.push({
        code: 'custom',
        input: client,
        message: errorMessages.common.bodyEmpty,
        path: ['client'],
      });
    }

    if (!client.documentNumberType && client.documentNumber) {
      params.ctx.issues.push({
        code: 'custom',
        input: client.documentNumber,
        message: errorMessages.order.cannotSetDocumentNumber,
        path: ['client', 'documentNumber'],
      });
    }

    if (client.documentNumberType && !client.documentNumber) {
      params.ctx.issues.push({
        code: 'custom',
        input: client.documentNumber,
        message: errorMessages.order.missingDocumentNumber,
        path: ['client', 'documentNumber'],
      });
    }
  }
};
