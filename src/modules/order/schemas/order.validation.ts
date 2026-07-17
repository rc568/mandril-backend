import type { z } from 'zod';
import { errorMessages } from '@/shared/domain';
import type { OrderUpdateDto } from './order.schema';

export const orderValidation = (ctx: z.core.ParsePayload<OrderUpdateDto>, isUpdate: boolean = false) => {
  const { client, products, invoiceType } = ctx.value;

  if (invoiceType === 'BOLETA' && client.documentType !== 'SIN DOCUMENTO') {
    if (!client.bussinessName) {
      ctx.issues.push({
        code: 'custom',
        input: client.bussinessName,
        message: errorMessages.order.missingBussinessName,
        path: ['client', 'bussinessName'],
      });
    }

    if (!client.documentNumber) {
      ctx.issues.push({
        code: 'custom',
        input: client.documentNumber,
        message: errorMessages.order.missingDocumentNumber,
        path: ['client', 'documentNumber'],
      });
    }
  }

  if (invoiceType === 'BOLETA' && client.documentType === 'SIN DOCUMENTO') {
    if (client.documentNumber) {
      ctx.issues.push({
        code: 'custom',
        input: client.documentNumber,
        message: errorMessages.order.cannotSetDocumentNumber,
        path: ['client', 'documentNumber'],
      });
    }
  }

  if (products && products.length > 0) {
    const uniqueProducts = new Set(products.map((p) => p.variantId));
    if (uniqueProducts.size !== products.length) {
      ctx.issues.push({
        code: 'custom',
        input: products,
        message: errorMessages.order.duplicatedProducts,
        path: ['products'],
      });
    }
  }

  if (isUpdate && client && Object.keys(client).length === 0) {
    ctx.issues.push({
      code: 'custom',
      input: client,
      message: errorMessages.common.bodyEmpty,
      path: ['client'],
    });
  }
};
