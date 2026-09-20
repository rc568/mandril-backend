import type { RequestHandler } from 'express';
import { CustomError, errorMessages } from '@/shared/domain';
import { MulterError, multer } from '@/shared/libs';
import { PRODUCT_IMAGE_LIMITS } from '../domain';

const receiveImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PRODUCT_IMAGE_LIMITS.maxFileSize, files: 1, fields: 0, parts: 2 },
}).single('image');

let activeUploads = 0;

export const withProductImageUpload =
  (handler: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    if (activeUploads >= PRODUCT_IMAGE_LIMITS.maxConcurrentUploads) {
      next(new CustomError({ statusCode: 429, message: errorMessages.product.imageUploadBusy }));
      return;
    }
    activeUploads++;
    try {
      await new Promise<void>((resolve, reject) => {
        receiveImage(req, res, (error: unknown) => {
          if (error instanceof MulterError) {
            reject(
              new CustomError({
                statusCode: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
                message:
                  error.code === 'LIMIT_FILE_SIZE'
                    ? errorMessages.product.imageTooLarge
                    : errorMessages.product.invalidImageUpload,
              }),
            );
          } else if (error) {
            reject(CustomError.badRequest(errorMessages.product.invalidImageUpload));
          } else {
            resolve();
          }
        });
      });
      if (!req.file) throw CustomError.badRequest(errorMessages.product.imageRequired);
      if (req.aborted || res.destroyed) return;
      await handler(req, res, next);
    } catch (error) {
      next(error);
    } finally {
      activeUploads--;
    }
  };
