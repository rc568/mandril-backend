import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';
import { validateRequest } from '../middlewares';
import { StatsService } from '../services/stats.service';
import { adminEmployeeAccess } from '../utils';
import { coldProductsQuerySchema, rankingProductsQuerySchema, salesSummaryQuerySchema } from '../validators';

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
