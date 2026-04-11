import { AuthRouter } from '@/modules/auth/auth.routes';
import { CatalogRouter } from '@/modules/catalog/catalog.routes';
import { CategoryRouter } from '@/modules/category/category.routes';
import { OrderRouter } from '@/modules/order/orders.routes';
import { ProductRouter } from '@/modules/product/product.routes';
import { SalesChannelRouter } from '@/modules/sales-channel/sales-channel.routes';
import { SeedRouter } from '@/modules/seed/seed.routes';
import { StatsRouter } from '@/modules/stats/stats.routes';
import { VariantAttributeRouter } from '@/modules/variant-attribute/variant-attribute.routes';
import { Router } from 'express';

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
