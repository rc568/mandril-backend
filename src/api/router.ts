import { Router } from 'express';
import {
  AuthRouter,
  CatalogRouter,
  CategoryRouter,
  OrderRouter,
  ProductRouter,
  SalesChannelRouter,
  StatsRouter,
  VariantAttributeRouter,
} from './routes';
import { SeedRouter } from './seed/seed.routes';

export const routerApp = () => {
  const router = Router();

  const authRouter = AuthRouter.create();
  const productRouter = ProductRouter.create();
  const categoryRouter = CategoryRouter.create();
  const catalogRouter = CatalogRouter.create();
  const variantAttributeRouter = VariantAttributeRouter.create();
  const orderRouter = OrderRouter.create();
  const seedRouter = SeedRouter.create();
  const salesChannelRouter = SalesChannelRouter.create();
  const statsRouter = StatsRouter.create();

  router.use('/products', productRouter);
  router.use('/catalogs', catalogRouter);
  router.use('/categories', categoryRouter);
  router.use('/attributes', variantAttributeRouter);
  router.use('/auth', authRouter);
  router.use('/orders', orderRouter);
  router.use('/seed', seedRouter);
  router.use('/sales-channel', salesChannelRouter);
  router.use('/stats', statsRouter);

  return router;
};
