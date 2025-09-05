import type { Request, Response } from 'express';
import type { CatalogService } from '../services/catalog.service';

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  getCatalogs = async (_req: Request, res: Response) => {
    const data = await this.catalogService.getAll();
    res.sendResponse({ data, errors: null });
  };

  getCatalogById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const catalog = await this.catalogService.getById(id);
    res.sendResponse({ data: catalog, errors: null });
  };

  createCategory = async (req: Request, res: Response) => {
    const catalog = await this.catalogService.create(req.validatedBody);
    res.sendResponse({ data: catalog, errors: null });
  };

  deleteCatalog = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.catalogService.delete(id);
    res.sendResponse({ data: null, errors: null });
  };

  updateCatalog = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const catalog = await this.catalogService.update(id, req.validatedBody);
    res.sendResponse({ data: catalog, errors: null });
  };
}
