import { Router } from 'express';
import { OrderController } from '../controllers';
import { validateRequest } from '../middlewares';
import {
  CatalogService,
  CategoryService,
  OrderService,
  ProductService,
  SkuCounter,
  VariantAttributeService,
  VariantAttributeValueService,
} from '../services';
import { adminEmployeeAccess } from '../utils';
import { orderQuerySchema, orderSchema, paramsUuidv4IdSchema, updateOrderSchema } from '../validators';

export class OrderRouter {
  static create() {
    const router = Router();
    const categoryService = new CategoryService();
    const catalogService = new CatalogService();
    const variantAttributeService = new VariantAttributeService();
    const skuCounter = new SkuCounter();
    const variantAttributeValueService = new VariantAttributeValueService(variantAttributeService);
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
    router.post('/', adminEmployeeAccess, validateRequest({ body: orderSchema }), orderController.createOrder);
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
