import type { Request, Response } from 'express';
import { successMessages } from '../../domain/messages';
import type { VariantAttributeValueService } from '../services';

export class VariantAttributeValueController {
  constructor(private readonly variantAttributeService: VariantAttributeValueService) {}

  getAllVariantAttributes = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const attributes = await this.variantAttributeService.getAllById(id);
    res.sendSuccess({ data: attributes });
  };

  createValue = async (req: Request, res: Response) => {
    const valueCreated = await this.variantAttributeService.create(req.validatedParams.id, req.validatedBody);
    res.sendSuccess({
      data: valueCreated,
      message: successMessages.variantAttributeValue.create,
      statusCode: 201,
    });
  };

  deleteValue = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.variantAttributeService.delete(id);
    return res.sendSuccess({
      data: null,
    });
  };

  updateValue = async (req: Request, res: Response) => {
    const { attributeId, valueId } = req.validatedParams;
    const updatedValue = await this.variantAttributeService.update(attributeId, valueId, req.validatedBody);
    return res.sendSuccess({
      message: successMessages.variantAttributeValue.update,
      data: updatedValue,
    });
  };
}
