import { Router } from 'express';
import { CatalogRouter, CategoryRouter, ProductRouter } from './routes';
import { SeedRouter } from './seed/seed.routes';

export const routerApp = () => {
  const router = Router();

  const productRouter = ProductRouter.create();
  const categoryRouter = CategoryRouter.create();
  const catalogRouter = CatalogRouter.create();
  const seedRouter = SeedRouter.create();

  router.use('/products', productRouter);
  router.use('/catalogs', catalogRouter);
  router.use('/categories', categoryRouter);
  router.use('/seed', seedRouter);

  return router;
};
