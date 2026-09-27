import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { SupplierOrderService } from './supplier-order.service';

export class SupplierOrderController {
  constructor(private readonly supplierOrderService: SupplierOrderService) {}

  getOrders = async (req: Request, res: Response) => {
    const orders = await this.supplierOrderService.getAll(req.validatedQuery);
    res.sendSuccess({ data: orders });
  };

  getOrderById = async (req: Request, res: Response) => {
    const order = await this.supplierOrderService.getById(req.validatedParams.id);
    res.sendSuccess({ data: order });
  };

  createOrder = async (req: Request, res: Response) => {
    requireAuth(req);
    const order = await this.supplierOrderService.create(req.validatedBody, req.user.id);
    res.sendSuccess({ data: order, statusCode: 201 });
  };

  updateOrder = async (req: Request, res: Response) => {
    requireAuth(req);
    const order = await this.supplierOrderService.update(req.validatedParams.id, req.validatedBody, req.user.id);
    res.sendSuccess({ data: order });
  };

  markInTransit = async (req: Request, res: Response) => {
    requireAuth(req);
    const order = await this.supplierOrderService.markInTransit(req.validatedParams.id, req.user.id);
    res.sendSuccess({ data: order });
  };

  cancelOrder = async (req: Request, res: Response) => {
    requireAuth(req);
    const order = await this.supplierOrderService.cancel(req.validatedParams.id, req.user.id);
    res.sendSuccess({ data: order });
  };

  updateProjectedExchangeRate = async (req: Request, res: Response) => {
    requireAuth(req);
    const order = await this.supplierOrderService.updateProjectedExchangeRate(
      req.validatedParams.id,
      req.validatedBody,
      req.user.id,
    );
    res.sendSuccess({ data: order });
  };
}
