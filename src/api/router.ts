import { Router } from 'express';
import { createProductRouter } from './routes';

export const routerApp = () => {
  const router = Router();

  const productRouter = createProductRouter();

  router.use('/products', productRouter);

  return router;
};
