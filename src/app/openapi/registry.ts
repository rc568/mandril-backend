import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/shared/libs';

extendZodWithOpenApi(z);

export const openApiRegistry = new OpenAPIRegistry();

export const ApiErrorSchema = openApiRegistry.register(
  'ApiError',
  z.object({
    message: z.string().describe('Mensaje del error.'),
    code: z.string().optional().describe('Código estable del error, cuando aplica.'),
    validationErrors: z
      .array(
        z.object({
          field: z.string().optional().describe('Campo que produjo el error.'),
          message: z.string().describe('Detalle de validación.'),
          code: z.string().optional().describe('Código de validación, cuando aplica.'),
        }),
      )
      .optional()
      .describe('Detalles presentes cuando el error corresponde a la validación de datos.'),
  }),
);

openApiRegistry.registerComponent('securitySchemes', 'AccessTokenCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'accessToken',
  description:
    'Cookie HttpOnly establecida por POST /auth/login. Expira en 15 minutos; en producción usa Secure y SameSite=Strict.',
});

openApiRegistry.registerComponent('securitySchemes', 'RefreshTokenCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'refreshToken',
  description:
    'Cookie HttpOnly establecida por POST /auth/login. Expira en 24 horas, usa SameSite=Strict y está limitada a /api/auth/token.',
});

export const apiErrorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: ApiErrorSchema,
    },
  },
});
