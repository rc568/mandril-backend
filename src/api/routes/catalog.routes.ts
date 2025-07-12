import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';

export class CatalogRouter {
  static create() {
    const router = Router();
    const productsController = new ProductController();

    router.get('/', (req, res) => productsController.getProducts(req, res));
    router.get('/:id', (req, res) => productsController.getProductById(req, res));

    return router;
  }
}
