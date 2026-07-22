import { Router } from 'express';
import { AuthRouter } from '@/modules/auth';
import { CatalogRouter } from '@/modules/catalog';
import { CategoryRouter } from '@/modules/category';
import { ClientRouter } from '@/modules/client';
import { OrderRouter } from '@/modules/order';
import { ProductRouter } from '@/modules/product';
import { SalesChannelRouter } from '@/modules/sales-channel';
import { SeedRouter } from '@/modules/seed';
import { StatsRouter } from '@/modules/stats';
import { VariantAttributeRouter } from '@/modules/variant-attribute';

export const routerApp = () => {
  const router = Router();

  const authRouter = AuthRouter.create();
  const productRouter = ProductRouter.create();
  const categoryRouter = CategoryRouter.create();
  const catalogRouter = CatalogRouter.create();
  const variantAttributeRouter = VariantAttributeRouter.create();
  const orderRouter = OrderRouter.create();
  const clientRouter = ClientRouter.create();
  const seedRouter = SeedRouter.create();
  const salesChannelRouter = SalesChannelRouter.create();
  const statsRouter = StatsRouter.create();

  router.use('/products', productRouter);
  router.use('/catalogs', catalogRouter);
  router.use('/categories', categoryRouter);
  router.use('/attributes', variantAttributeRouter);
  router.use('/auth', authRouter);
  router.use('/orders', orderRouter);
  router.use('/clients', clientRouter);
  router.use('/seed', seedRouter);
  router.use('/sales-channel', salesChannelRouter);
  router.use('/stats', statsRouter);

  return router;
};
