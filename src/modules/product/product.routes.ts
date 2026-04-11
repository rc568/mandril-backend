import { Router } from 'express';
import { CatalogService } from '@/modules/catalog';
import { CategoryService } from '@/modules/category';
import { SkuCounterService } from '@/modules/sku-counter';
import { VariantAttributeService } from '@/modules/variant-attribute';
import { VariantAttributeValueService } from '@/modules/variant-attribute-value';
import { adminAccess, adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { generateParamsSchema, paramsIdSchema, smallSerialIdSchema } from '@/shared/validators';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { createProductSchema, getAllProductQuerySchema, updateProductSchema } from './product.validators';

export class ProductRouter {
  static create() {
    const router = Router();
    const categoryService = new CategoryService();
    const catalogService = new CatalogService();
    const variantAttributeService = new VariantAttributeService();
    const skuCounter = new SkuCounterService();
    const variantAttributeValueService = new VariantAttributeValueService(variantAttributeService);
    const productService = new ProductService(
      categoryService,
      catalogService,
      variantAttributeService,
      variantAttributeValueService,
      skuCounter,
    );
    const productsController = new ProductController(productService);

    router.get('/', validateRequest({ query: getAllProductQuerySchema }), productsController.getProducts);
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
