import type { Request, Response } from 'express';
import { successMessages } from '../../domain/constants';
import type { ProductService } from '../services';
import { requireAuth } from '../utils/guards';

export class ProductController {
  constructor(private readonly productService: ProductService) {}

  getProducts = async (req: Request, res: Response) => {
    const products = await this.productService.getAll(req.validatedQuery);
    return res.sendSuccess({ data: products });
  };

  getProductBySlug = async (req: Request, res: Response) => {
    const { identifier } = req.params;
    const product = await this.productService.getByIdentifier(identifier);
    res.sendSuccess({ data: product });
  };

  createProduct = async (req: Request, res: Response) => {
    requireAuth(req);
    const product = await this.productService.create(req.body, req.user.id);
    return res.sendSuccess({ data: product, message: successMessages.product.createProduct });
  };

  updateProduct = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const updateProduct = await this.productService.update(id, req.validatedBody, req.user.id);
    return res.sendSuccess({ data: updateProduct, message: successMessages.product.updateProduct });
  };

  sofDeleteVariantProduct = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id, variantId } = req.validatedParams;
    await this.productService.softDeleteVariant(id, variantId, req.user.id);
    return res.sendSuccess({ data: null, message: successMessages.product.variantDelete });
  };

  softDeleteProduct = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    await this.productService.softDelete(id, req.user.id);
    return res.sendSuccess({ data: null, message: successMessages.product.productDelete });
  };
}
