import type { Request, Response } from 'express';
import type { VariantAttributeValueService } from '../services';

export class VariantAttributeValueController {
  constructor(private readonly variantAttributeService: VariantAttributeValueService) {}

  getAllVariantAttributes = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const attributes = await this.variantAttributeService.getAllById(id);
    res.sendResponse({ success: true, data: attributes, errors: null });
  };

  createValue = async (req: Request, res: Response) => {
    const valueCreated = await this.variantAttributeService.create(req.validatedParams.id, req.validatedBody);
    res.sendResponse({
      success: true,
      data: valueCreated,
      message: 'Value created succesfully in corresponding attribute.',
      errors: null,
      statusCode: 201,
    });
  };

  deleteValue = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.variantAttributeService.delete(id);
    return res.sendResponse({
      success: true,
      message: 'Value deleted correctly.',
      data: null,
      errors: null,
    });
  };

  updateValue = async (req: Request, res: Response) => {
    const { attributeId, valueId } = req.validatedParams;
    const updatedValue = await this.variantAttributeService.update(attributeId, valueId, req.validatedBody);
    return res.sendResponse({
      success: true,
      message: 'Value from corresponding attribute updated correctly.',
      data: updatedValue,
      errors: null,
    });
  };
}
