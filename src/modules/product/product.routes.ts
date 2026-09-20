import { Router } from 'express';
import { CatalogService } from '@/modules/catalog';
import { CategoryService } from '@/modules/category';
import { SkuCounterService } from '@/modules/sku-counter';
import { VariantAttributeService, VariantAttributeValueService } from '@/modules/variant-attribute';
import { adminAccess, adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { generateParamsSchema, paramsIdSchema, smallSerialIdSchema } from '@/shared/validators';
import { withProductImageUpload } from './middlewares/product-image.middleware';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductImageService } from './product-image.service';
import {
  createProductSchema,
  forceProductWillBecomeWithoutAttributesQuery,
  getAllProductQuerySchema,
  getByIdentifierParams,
  getSearchProductVariantsQuery,
  organizeProductImagesSchema,
  updateProductSchema,
} from './schemas/product.schema';

export class ProductRouter {
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
    const productsController = new ProductController(productService, new ProductImageService());

    router.post(
      '/:id/variants/:variantId/images',
      adminEmployeeAccess,
      validateRequest({ params: generateParamsSchema({ id: smallSerialIdSchema, variantId: smallSerialIdSchema }) }),
      withProductImageUpload(productsController.uploadImage),
    );
    router.patch(
      '/:id/variants/:variantId/images',
      adminEmployeeAccess,
      validateRequest({
        params: generateParamsSchema({ id: smallSerialIdSchema, variantId: smallSerialIdSchema }),
        body: organizeProductImagesSchema,
      }),
      productsController.organizeImages,
    );

    router.get('/', validateRequest({ query: getAllProductQuerySchema }), productsController.getProducts);
    router.get(
      '/variants/search',
      adminEmployeeAccess,
      validateRequest({ query: getSearchProductVariantsQuery }),
      productsController.getSearchProductVariants,
    );
    router.get('/:identifier', validateRequest({ params: getByIdentifierParams }), productsController.getProductBySlug);
    router.post(
      '/',
      adminEmployeeAccess,
      validateRequest({ body: createProductSchema }),
      productsController.createProduct,
    );
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({
        params: paramsIdSchema,
        query: forceProductWillBecomeWithoutAttributesQuery,
        body: updateProductSchema,
      }),
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
