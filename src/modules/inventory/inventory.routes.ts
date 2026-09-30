import { Router } from 'express';
import { adminAccess, adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { InventoryController } from './inventory.controller';
import { InventoryAdjustmentService } from './inventory-adjustment.service';
import { InventoryQueryService } from './inventory-query.service';
import {
  adjustInventorySchema,
  inventoryBalancesQuerySchema,
  inventoryMovementsQuerySchema,
} from './schemas/inventory.schema';

export class InventoryRouter {
  static create() {
    const router = Router();
    const controller = new InventoryController(new InventoryAdjustmentService(), new InventoryQueryService());
    router.get(
      '/balances',
      adminEmployeeAccess,
      validateRequest({ query: inventoryBalancesQuerySchema }),
      controller.getBalances,
    );
    router.get(
      '/movements',
      adminEmployeeAccess,
      validateRequest({ query: inventoryMovementsQuerySchema }),
      controller.getMovements,
    );
    router.post('/adjustments', adminAccess, validateRequest({ body: adjustInventorySchema }), controller.adjust);
    return router;
  }
}
