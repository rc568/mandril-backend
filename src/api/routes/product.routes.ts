import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';

export const createProductRouter = () => {
  const router = Router();
  const usersController = new ProductController();

  router.get('/', (req, res) => usersController.getProducts(req, res));
  router.get('/:id', (req, res) => usersController.getProductById(req, res));

  return router;
};
