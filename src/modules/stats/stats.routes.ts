import { Router } from 'express';
import { adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { coldProductsQuerySchema, rankingProductsQuerySchema, salesSummaryQuerySchema } from './stats.validators';

export class StatsRouter {
  static create() {
    const router = Router();
    const statsService = new StatsService();
    const statsController = new StatsController(statsService);

    router.get('/inventory', adminEmployeeAccess, statsController.getInventoryStats);
    router.get(
      '/products/ranking',
      adminEmployeeAccess,
      validateRequest({ query: rankingProductsQuerySchema }),
      statsController.getRankingProducts,
    );
    router.get(
      '/products/cold',
      adminEmployeeAccess,
      validateRequest({ query: coldProductsQuerySchema }),
      statsController.getColdProducts,
    );
    router.get(
      '/sales/summary',
      adminEmployeeAccess,
      validateRequest({ query: salesSummaryQuerySchema }),
      statsController.getSalesSummary,
    );

    return router;
  }
}
