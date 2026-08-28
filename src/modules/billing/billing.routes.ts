import { Router } from 'express';
import { CatalogService } from '@/modules/catalog';
import { CategoryService } from '@/modules/category';
import { OrderService } from '@/modules/order';
import { ProductService } from '@/modules/product';
import { SkuCounterService } from '@/modules/sku-counter';
import { VariantAttributeService, VariantAttributeValueService } from '@/modules/variant-attribute';
import { adminEmployeeAccess } from '@/shared/auth';
import { validateRequest } from '@/shared/middlewares';
import { generateParamsSchema, paramsUuidv4IdSchema, uuidV4Schema } from '@/shared/validators';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { billingOrderCreateSchema, billingOrderUdpateSchema, issueBillingSchema } from './schemas/billing.schema';

export class BillingRouter {
  static create() {
    const billingRouter = Router();
    const orderBillingRouter = Router();

    const categoryService = new CategoryService();
    const catalogService = new CatalogService();
    const variantAttributeService = new VariantAttributeService();
    const skuCounter = new SkuCounterService();
    const variantAttributeValueService = new VariantAttributeValueService();
    const productService = new ProductService(
      categoryService,
      catalogService,
      variantAttributeService,
      variantAttributeValueService,
      skuCounter,
    );
    const orderService = new OrderService(productService);
    const billingService = new BillingService(orderService);
    const billingController = new BillingController(billingService);

    orderBillingRouter.post(
      '/:orderId/billing',
      adminEmployeeAccess,
      validateRequest({
        body: billingOrderCreateSchema,
        params: generateParamsSchema({ orderId: uuidV4Schema }),
      }),
      billingController.createBilling,
    );

    billingRouter.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsUuidv4IdSchema, body: billingOrderUdpateSchema }),
      billingController.updateBilling,
    );

    billingRouter.patch(
      '/:id/issue',
      adminEmployeeAccess,
      validateRequest({ params: paramsUuidv4IdSchema, body: issueBillingSchema }),
      billingController.issueBilling,
    );

    billingRouter.patch(
      '/:id/void',
      adminEmployeeAccess,
      validateRequest({ params: paramsUuidv4IdSchema }),
      billingController.voidBilling,
    );

    return { billingRouter, orderBillingRouter };
  }
}
