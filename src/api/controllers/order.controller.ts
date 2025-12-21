import type { Request, Response } from 'express';
import type { OrderService } from '../services';
import { requireAuth } from '../utils';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  getOrders = async (req: Request, res: Response) => {
    const orders = await this.orderService.getAll(req.validatedQuery);
    res.sendSuccess({ data: orders });
  };

  getOrderById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const order = await this.orderService.getById(id);
    res.sendSuccess({ data: order });
  };

  createOrder = async (req: Request, res: Response) => {
    requireAuth(req);
    const order = await this.orderService.create(req.validatedBody, req.user.id);
    res.sendSuccess({ data: order, statusCode: 201 });
  };

  updateOrder = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const order = await this.orderService.update(id, req.validatedBody, req.user.id);
    res.sendSuccess({ data: order });
  };

  softDeleteOrder = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    await this.orderService.softDelete(id, req.user.id);
    res.sendSuccess({ data: null });
  };
}
