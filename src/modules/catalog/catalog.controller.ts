import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { CatalogService } from './catalog.service';

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  getCatalogs = async (_req: Request, res: Response) => {
    const catalogs = await this.catalogService.getAll();
    res.sendSuccess({ data: catalogs });
  };

  getCatalogById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const catalog = await this.catalogService.getById(id);
    res.sendSuccess({ data: catalog });
  };

  createCategory = async (req: Request, res: Response) => {
    requireAuth(req);
    const catalog = await this.catalogService.create(req.validatedBody, req.user.id);
    res.sendSuccess({ data: catalog, statusCode: 201 });
  };

  softDeleteCatalog = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const { force } = req.validatedQuery;
    await this.catalogService.softDelete(id, force, req.user.id);
    res.sendSuccess({ data: null });
  };

  updateCatalog = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const catalog = await this.catalogService.update(id, req.validatedBody, req.user.id);
    res.sendSuccess({ data: catalog });
  };
}
