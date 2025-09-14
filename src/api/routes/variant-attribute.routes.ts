import { Router } from 'express';
import { VariantAttributeController, VariantAttributeValueController } from '../controllers';
import { validateRequest } from '../middlewares';
import { VariantAttributeService, VariantAttributeValueService } from '../services';
import {
  createVariantAttributeSchema,
  createVariantAttributeValueSchema,
  paramsIdSchema,
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

    router.get('/', variantAttributeController.getAttributes);
    router.get('/:id', validateRequest(paramsIdSchema), variantAttributeController.getAttributeById);
    router.post('/', validateRequest(createVariantAttributeSchema), variantAttributeController.createAttribute);
    router.patch('/:id', validateRequest(updateVariantAttributeSchema), variantAttributeController.updateAttribute);
    router.delete('/:id', validateRequest(paramsIdSchema), variantAttributeController.deleteAttribute);

    router.get('/:id/values', validateRequest(paramsIdSchema), variantAttributeValueController.getAllVariantAttributes);
    router.post(
      '/:id/values',
      validateRequest(createVariantAttributeValueSchema),
      variantAttributeValueController.createValue,
    );
    router.patch(
      '/:attributeId/values/:valueId',
      validateRequest(updateVariantAttributeValueSchema),
      variantAttributeValueController.updateValue,
    );
    router.delete('/values/:id', validateRequest(paramsIdSchema), variantAttributeValueController.deleteValue);

    return router;
  }
}
