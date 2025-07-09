import type { Request, Response } from 'express';

export class ProductController {
  //   constructor(private readonly productService: ProductService) {}

  getProducts = (_req: Request, res: Response) => {
    res.send('get all products');
  };

  getProductById = (req: Request, res: Response) => {
    const { id } = req.params;
    res.send(`get product with id: ${id}`);
  };
}
