import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { validateRequest } from '../middlewares';
import {
  CatalogService,
  CategoryService,
  ProductService,
  SkuCounter,
  VariantAttributeService,
  VariantAttributeValueService,
} from '../services';
import { adminAccess, adminEmployeeAccess } from '../utils/auth-access';
import {
  createProductSchema,
  generateParamsSchema,
  paramsIdSchema,
  smallSerialIdSchema,
  updateProductSchema,
} from '../validators';

export class ProductRouter {
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
    const productsController = new ProductController(productService);

    router.get('/', productsController.getProducts);
    router.get('/:identifier', productsController.getProductBySlug);
    router.post(
      '/',
      adminEmployeeAccess,
      validateRequest({ body: createProductSchema }),
      productsController.createProduct,
    );
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema, body: updateProductSchema }),
      productsController.updateProduct,
    );
    router.delete(
      '/:id',
      adminAccess,
      validateRequest({ params: paramsIdSchema }),
      productsController.softDeleteProduct,
    );
    router.delete(
      '/:id/variant/:variantId',
      adminAccess,
      validateRequest({ params: generateParamsSchema({ id: smallSerialIdSchema, variantId: smallSerialIdSchema }) }),
      productsController.sofDeleteVariantProduct,
    );

    return router;
  }
}
