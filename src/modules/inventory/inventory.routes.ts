import { Router } from 'express';
import { adminAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { InventoryController } from './inventory.controller';
import { InventoryAdjustmentService } from './inventory-adjustment.service';
import { adjustInventorySchema } from './schemas/inventory.schema';

export class InventoryRouter {
  static create() {
    const router = Router();
    const controller = new InventoryController(new InventoryAdjustmentService());
    router.post('/adjustments', adminAccess, validateRequest({ body: adjustInventorySchema }), controller.adjust);
    return router;
  }
}
