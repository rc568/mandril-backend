import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { SupplierOrderIssueService } from './supplier-order-issue.service';

export class SupplierOrderIssueController {
  constructor(private readonly issueService: SupplierOrderIssueService) {}

  getIssues = async (req: Request, res: Response) => {
    res.sendSuccess({ data: await this.issueService.getAll(req.validatedParams.orderId) });
  };

  createIssue = async (req: Request, res: Response) => {
    requireAuth(req);
    const issue = await this.issueService.create(req.validatedParams.orderId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: issue, statusCode: 201 });
  };

  closeIssue = async (req: Request, res: Response) => {
    requireAuth(req);
    const { orderId, issueId } = req.validatedParams;
    const issue = await this.issueService.close(orderId, issueId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: issue });
  };
}
