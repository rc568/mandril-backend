import type { Request, Response } from 'express';
import { CustomError } from '../../domain/errors/custom.error';
import type { ProductService } from '../services';

export class ProductController {
  constructor(private readonly productService: ProductService) {}

  getProducts = async (_req: Request, res: Response) => {
    const data = await this.productService.getAll();
    return res.sendResponse({ data, errors: null });
  };

  getProductBySlug = async (req: Request, res: Response) => {
    const { identifier } = req.params;
    const product = await this.productService.getByIdentifier(identifier);
    res.sendResponse({ data: product, errors: null });
  };

  createProduct = async (req: Request, res: Response) => {
    const product = await this.productService.create(req.body);
    if (!product) throw CustomError.internalServer('Unexpected error ocurred.');
    return res.sendResponse({ data: product, errors: null });
  };

  updateProduct = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const updateProduct = await this.productService.update(id, req.validatedBody);
    // biome-ignore lint/style/noNonNullAssertion: <not if not found then an error is retrieve>
    return res.sendResponse({ data: updateProduct!, errors: null });
  };
}
