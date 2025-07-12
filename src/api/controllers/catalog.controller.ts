import type { Request, Response } from 'express';

export class CatalogController {
  //   constructor(private readonly productService: ProductService) {}

  getCatalogs = (_req: Request, res: Response) => {
    res.send('get all catalogs');
  };

  getCatalogById = (req: Request, res: Response) => {
    const { id } = req.params;
    res.send(`get catalog with id: ${id}`);
  };
}
