import { Router } from 'express';
import { CategoryController } from '../controllers/';
import { CategoryService } from '../services/category.service';

export class CategoryRouter {
  static create() {
    const router = Router();
    const categoryService = new CategoryService();
    const categoryController = new CategoryController(categoryService);

    router.get('/', (req, res) => categoryController.getCategories(req, res));
    router.get('/:id', (req, res) => categoryController.getCategoryById(req, res));
    router.post('/', (req, res) => categoryController.createCategory(req, res));
    router.delete('/:id', (req, res) => categoryController.deleteCategory(req, res));
    router.patch('/:id', (req, res) => categoryController.updateCategory(req, res));

    return router;
  }
}
