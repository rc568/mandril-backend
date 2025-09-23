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
import { createProductSchema, updateProductSchema } from '../validators';

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
    router.get('/details/:identifier', productsController.getProductBySlug);
    router.post('/', validateRequest(createProductSchema), productsController.createProduct);
    router.patch('/:id', validateRequest(updateProductSchema), productsController.updateProduct);

    return router;
  }
}
