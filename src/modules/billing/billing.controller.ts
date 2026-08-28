import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { BillingService } from './billing.service';

export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  createBilling = async (req: Request, res: Response) => {
    requireAuth(req);
    const { orderId } = req.validatedParams;
    const createdBill = await this.billingService.create(orderId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: createdBill, statusCode: 201 });
  };

  updateBilling = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const updatedBill = await this.billingService.update(id, req.validatedBody, req.user.id);
    res.sendSuccess({ data: updatedBill });
  };

  issueBilling = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const issuedBill = await this.billingService.issue(id, req.validatedBody, req.user.id);
    res.sendSuccess({ data: issuedBill });
  };

  voidBilling = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const voidedBill = await this.billingService.void(id, req.user.id);
    res.sendSuccess({ data: voidedBill });
  };
}
