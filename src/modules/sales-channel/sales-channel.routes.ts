import { Router } from 'express';
import { adminAccess, adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsIdSchema } from '@/shared/validators';
import { SalesChannelController } from './sales-channel.controller';
import { SalesChannelService } from './sales-channel.service';
import { createSaleChannelSchema, updateSaleChannelSchema } from './sales-channel.validators';

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
