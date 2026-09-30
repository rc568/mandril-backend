import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { SupplierOrderReceiptService } from './supplier-order-receipt.service';
import type { SupplierOrderReceiptReviewService } from './supplier-order-receipt-review.service';

export class SupplierOrderReceiptController {
  constructor(
    private readonly receiptService: SupplierOrderReceiptService,
    private readonly reviewService: SupplierOrderReceiptReviewService,
  ) {}

  getReceipts = async (req: Request, res: Response) => {
    res.sendSuccess({ data: await this.receiptService.getAll(req.validatedParams.orderId) });
  };

  getReceiptById = async (req: Request, res: Response) => {
    const { orderId, receiptId } = req.validatedParams;
    res.sendSuccess({ data: await this.receiptService.getById(orderId, receiptId) });
  };

  createReceipt = async (req: Request, res: Response) => {
    requireAuth(req);
    const receipt = await this.receiptService.create(req.validatedParams.orderId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: receipt, statusCode: 201 });
  };

  reviewReceipt = async (req: Request, res: Response) => {
    requireAuth(req);
    const { orderId, receiptId } = req.validatedParams;
    const receipt = await this.reviewService.review(orderId, receiptId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: receipt });
  };

  closeReceiving = async (req: Request, res: Response) => {
    requireAuth(req);
    res.sendSuccess({ data: await this.receiptService.closeReceiving(req.validatedParams.orderId, req.user.id) });
  };

  postToInventory = async (req: Request, res: Response) => {
    requireAuth(req);
    const { orderId, receiptId } = req.validatedParams;
    res.sendSuccess({ data: await this.receiptService.postToInventory(orderId, receiptId, req.user.id) });
  };
}
