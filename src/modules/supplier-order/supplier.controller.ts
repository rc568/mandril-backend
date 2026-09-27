import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { SupplierService } from './supplier.service';

export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  getSuppliers = async (req: Request, res: Response) => {
    const suppliers = await this.supplierService.getAll(req.validatedQuery);
    res.sendSuccess({ data: suppliers });
  };

  getSupplierById = async (req: Request, res: Response) => {
    const supplier = await this.supplierService.getById(req.validatedParams.id);
    res.sendSuccess({ data: supplier });
  };

  createSupplier = async (req: Request, res: Response) => {
    requireAuth(req);
    const supplier = await this.supplierService.create(req.validatedBody, req.user.id);
    res.sendSuccess({ data: supplier, statusCode: 201 });
  };

  updateSupplier = async (req: Request, res: Response) => {
    requireAuth(req);
    const supplier = await this.supplierService.update(req.validatedParams.id, req.validatedBody, req.user.id);
    res.sendSuccess({ data: supplier });
  };
}
