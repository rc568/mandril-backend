import type { Request, Response } from 'express';
import type { VariantAttributeService } from '../services';

export class VariantAttributeController {
  constructor(private readonly variantAttributeService: VariantAttributeService) {}

  getAttributes = async (_req: Request, res: Response) => {
    const attributes = await this.variantAttributeService.getAll();
    res.sendResponse({ success: true, data: attributes, errors: null });
  };

  getAttributeById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const attribute = await this.variantAttributeService.getById(id);
    res.sendResponse({ success: true, data: attribute, errors: null });
  };

  createAttribute = async (req: Request, res: Response) => {
    const attributeCreated = await this.variantAttributeService.create(req.validatedBody);
    res.sendResponse({
      success: true,
      data: attributeCreated,
      message: 'Attribute created succesfully.',
      errors: null,
      statusCode: 201,
    });
  };

  deleteAttribute = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.variantAttributeService.delete(id);
    return res.sendResponse({
      success: true,
      message: 'Attribute deleted correctly.',
      data: null,
      errors: null,
    });
  };

  updateAttribute = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const updatedAttribute = await this.variantAttributeService.update(id, req.validatedBody);
    return res.sendResponse({
      success: true,
      message: 'Attribute update succesfully.',
      data: updatedAttribute,
      errors: null,
    });
  };
}
