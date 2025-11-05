import { Router } from 'express';
import { SalesChannelController } from '../controllers';
import { validateRequest } from '../middlewares';
import { SalesChannelService } from '../services';
import { adminAccess, adminEmployeeAccess } from '../utils';
import { createSaleChannelSchema, paramsIdSchema, updateSaleChannelSchema } from '../validators';

export class SalesChannelRouter {
  static create() {
    const router = Router();
    const salesChannelService = new SalesChannelService();
    const salesChannelController = new SalesChannelController(salesChannelService);

    router.get('/', adminEmployeeAccess, salesChannelController.getSalesChannel);
    router.get(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema }),
      salesChannelController.getSaleChannelById,
    );
    router.post(
      '/',
      adminEmployeeAccess,
      validateRequest({ body: createSaleChannelSchema }),
      salesChannelController.createSalesChannel,
    );
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema, body: updateSaleChannelSchema }),
      salesChannelController.updateSaleChannel,
    );
    router.delete(
      '/:id',
      adminAccess,
      validateRequest({ params: paramsIdSchema }),
      salesChannelController.softDeleteSaleChannel,
    );

    return router;
  }
}
