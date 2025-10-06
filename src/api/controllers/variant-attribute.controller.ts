import type { Request, Response } from 'express';
import { successMessages } from '../../domain/constants';
import type { VariantAttributeService } from '../services';

export class VariantAttributeController {
  constructor(private readonly variantAttributeService: VariantAttributeService) {}

  getAttributes = async (_req: Request, res: Response) => {
    const attributes = await this.variantAttributeService.getAll();
    res.sendSuccess({ data: attributes });
  };

  getAttributeById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const attribute = await this.variantAttributeService.getById(id);
    res.sendSuccess({ data: attribute });
  };

  createAttribute = async (req: Request, res: Response) => {
    const attributeCreated = await this.variantAttributeService.create(req.validatedBody);
    res.sendSuccess({
      data: attributeCreated,
      message: successMessages.variantAttribute.create,
      statusCode: 201,
    });
  };

  deleteAttribute = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.variantAttributeService.delete(id);
    return res.sendSuccess({
      data: null,
    });
  };

  updateAttribute = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const updatedAttribute = await this.variantAttributeService.update(id, req.validatedBody);
    return res.sendSuccess({
      message: successMessages.variantAttribute.update,
      data: updatedAttribute,
    });
  };
}
