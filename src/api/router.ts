import { Router } from 'express';
import { CatalogRouter, CategoryRouter, ProductRouter } from './routes';

export const routerApp = () => {
  const router = Router();

  const productRouter = ProductRouter.create();
  const categoryRouter = CategoryRouter.create();
  const catalogRouter = CatalogRouter.create();

  router.use('/products', productRouter);
  router.use('/catalogs', catalogRouter);
  router.use('/categories', categoryRouter);

  return router;
};
