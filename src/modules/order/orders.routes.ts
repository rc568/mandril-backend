import { Router } from 'express';
import { CatalogService } from '@/modules/catalog';
import { CategoryService } from '@/modules/category';
import { ProductService } from '@/modules/product';
import { SkuCounterService } from '@/modules/sku-counter';
import { VariantAttributeService, VariantAttributeValueService } from '@/modules/variant-attribute';
import { adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsUuidv4IdSchema } from '@/shared/validators';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { createOrderSchema, orderQuerySchema, updateOrderSchema } from './schemas/order.schema';

export class OrderRouter {
  static create() {
    const router = Router();
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
    const orderController = new OrderController(orderService);

    router.get('/', adminEmployeeAccess, validateRequest({ query: orderQuerySchema }), orderController.getOrders);
    router.get(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsUuidv4IdSchema }),
      orderController.getOrderById,
    );
    router.post('/', adminEmployeeAccess, validateRequest({ body: createOrderSchema }), orderController.createOrder);
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsUuidv4IdSchema, body: updateOrderSchema }),
      orderController.updateOrder,
    );
    router.delete(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsUuidv4IdSchema }),
      orderController.softDeleteOrder,
    );

    return router;
  }
}
