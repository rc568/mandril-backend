import { Router } from 'express';
import { VariantAttributeController, VariantAttributeValueController } from '../controllers';
import { validateRequest } from '../middlewares';
import { VariantAttributeService, VariantAttributeValueService } from '../services';
import { adminEmployeeAccess, protectedRoute } from '../utils';
import {
  createVariantAttributeSchema,
  createVariantAttributeValueSchema,
  generateParamsSchema,
  paramsIdSchema,
  smallSerialIdSchema,
  updateVariantAttributeSchema,
  updateVariantAttributeValueSchema,
} from '../validators';

export class VariantAttributeRouter {
  static create() {
    const router = Router();

    const variantAttributeService = new VariantAttributeService();
    const variantAttributeController = new VariantAttributeController(variantAttributeService);

    const variantAttributeValueService = new VariantAttributeValueService(variantAttributeService);
    const variantAttributeValueController = new VariantAttributeValueController(variantAttributeValueService);

    router.get('/', protectedRoute, variantAttributeController.getAttributes);
    router.get(
      '/:id',
      protectedRoute,
      validateRequest({ params: paramsIdSchema }),
      variantAttributeController.getAttributeById,
    );
    router.post(
      '/',
      adminEmployeeAccess,
      validateRequest({ body: createVariantAttributeSchema }),
      variantAttributeController.createAttribute,
    );
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema, body: updateVariantAttributeSchema }),
      variantAttributeController.updateAttribute,
    );
    router.delete(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema }),
      variantAttributeController.deleteAttribute,
    );

    router.get(
      '/:id/values',
      protectedRoute,
      validateRequest({ params: paramsIdSchema }),
      variantAttributeValueController.getAllVariantAttributes,
    );
    router.post(
      '/:id/values',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema, body: createVariantAttributeValueSchema }),
      variantAttributeValueController.createValue,
    );
    router.patch(
      '/:attributeId/values/:valueId',
      adminEmployeeAccess,
      validateRequest({
        params: generateParamsSchema({ attributeId: smallSerialIdSchema, valueId: smallSerialIdSchema }),
        body: updateVariantAttributeValueSchema,
      }),
      variantAttributeValueController.updateValue,
    );
    router.delete(
      '/values/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema }),
      variantAttributeValueController.deleteValue,
    );

    return router;
  }
}
