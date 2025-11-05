import type { Request, Response } from 'express';
import { successMessages } from '../../domain/messages';
import type { SalesChannelService } from '../services';
import { requireAuth } from '../utils';

export class SalesChannelController {
  constructor(private readonly salesChannelService: SalesChannelService) {}

  getSalesChannel = async (_req: Request, res: Response) => {
    const salesChannel = await this.salesChannelService.getAll();
    res.sendSuccess({ data: salesChannel });
  };

  getSaleChannelById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const saleChannel = await this.salesChannelService.getById(id);
    res.sendSuccess({ data: saleChannel });
  };

  createSalesChannel = async (req: Request, res: Response) => {
    requireAuth(req);
    const salesChannelCreated = await this.salesChannelService.create(req.validatedBody, req.user.id);
    res.sendSuccess({
      data: salesChannelCreated,
      message: successMessages.salesChannel.create,
      statusCode: 201,
    });
  };

  updateSaleChannel = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const updatedSaleChannel = await this.salesChannelService.update(id, req.validatedBody, req.user.id);
    return res.sendSuccess({ data: updatedSaleChannel, message: successMessages.salesChannel.update });
  };

  softDeleteSaleChannel = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    await this.salesChannelService.softDelete(id, req.user.id);
    return res.sendSuccess({ data: null, message: successMessages.salesChannel.delete });
  };
}
