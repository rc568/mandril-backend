import type { z } from 'zod';
import { errorMessages } from '@/shared/domain';
import type { OrderUpdateDto } from './order.schema';

export const orderValidation = (ctx: z.core.ParsePayload<OrderUpdateDto>, isUpdate: boolean = false) => {
  const { client, products } = ctx.value;

  if (products && products.length > 0) {
    const uniqueProducts = new Set(products.map((p) => p.variantId));
    if (uniqueProducts.size !== products.length) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value.products,
        message: errorMessages.order.duplicatedProducts,
        path: ['products'],
      });
    }
  }

  if (isUpdate && client && Object.keys(client).length === 0) {
    ctx.issues.push({
      code: 'custom',
      input: ctx.value.client,
      message: errorMessages.common.bodyEmpty,
      path: ['client'],
    });
  }
};
