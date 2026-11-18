import { loginUserSchema, registerUserSchema } from '@/modules/auth/auth.validator';
import { USER_ROLES } from '@/shared/auth';
import { z } from '@/shared/libs';
import { paramsUuidv4IdSchema } from '@/shared/validators';
import { apiErrorResponse, openApiRegistry } from './registry';

const authUserSchema = openApiRegistry.register(
  'AuthUser',
  z
    .object({
      id: z.uuid().describe('Identificador UUID del usuario.'),
      userName: z.string(),
      name: z.string(),
      lastName: z.string(),
      email: z.email(),
      role: z.enum(USER_ROLES),
    })
    .meta({
      example: {
        id: '9d5353d0-0c88-4a0e-9171-0dbe529da5e9',
        userName: 'anaperez',
        name: 'Ana',
        lastName: 'Pérez',
        email: 'ana@example.com',
        role: 'employee',
      },
    }),
);

const nullResponse = {
  description: 'La operación se completó correctamente y la respuesta JSON es null.',
  content: {
    'application/json': {
      schema: z.null(),
    },
  },
};

const standardAuthErrors = {
  400: apiErrorResponse('La solicitud no cumple la validación.'),
  401: apiErrorResponse('Falta la sesión o las credenciales no son válidas.'),
  403: apiErrorResponse('La sesión no tiene permiso para esta operación o el token no es válido.'),
  500: apiErrorResponse('Ocurrió un error interno.'),
};

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/check-auth',
  tags: ['Auth'],
  summary: 'Consultar la sesión actual',
  description: 'Devuelve los datos del usuario asociado a la cookie accessToken.',
  security: [{ AccessTokenCookie: [] }],
  responses: {
    200: {
      description: 'Sesión válida. Devuelve el usuario directamente como JSON.',
      content: { 'application/json': { schema: authUserSchema } },
    },
    401: standardAuthErrors[401],
    500: standardAuthErrors[500],
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Registrar un usuario',
  description:
    'Requiere que el usuario autenticado tenga el rol admin. El cuerpo requiere nombre, apellido, contraseña, username, email y rol.',
  security: [{ AccessTokenCookie: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registerUserSchema,
          examples: {
            employee: {
              summary: 'Crear una cuenta de empleado',
              value: {
                name: 'Ana',
                lastName: 'Pérez',
                password: 'Mandril2026',
                userName: 'anaperez',
                email: 'ana@example.com',
                role: 'employee',
              },
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Usuario creado. La respuesta es el objeto de usuario directamente.',
      content: { 'application/json': { schema: authUserSchema } },
    },
    ...standardAuthErrors,
    409: apiErrorResponse('El email o username ya está registrado.'),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Iniciar sesión',
  description:
    'Valida username y contraseña. Devuelve el usuario como JSON y establece las cookies HttpOnly accessToken y refreshToken.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: loginUserSchema,
          examples: {
            validCredentials: {
              summary: 'Iniciar sesión con username y contraseña',
              value: { userName: 'anaperez', password: 'Mandril2026' },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Credenciales válidas. También establece las cookies de sesión.',
      headers: {
        'Set-Cookie': {
          description: 'Establece las cookies HttpOnly accessToken y refreshToken.',
          schema: { type: 'string' },
        },
      },
      content: { 'application/json': { schema: authUserSchema } },
    },
    400: standardAuthErrors[400],
    401: apiErrorResponse('Username o contraseña incorrectos.'),
    500: standardAuthErrors[500],
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/token/refresh',
  tags: ['Auth'],
  summary: 'Renovar el token de acceso',
  description: 'Usa la cookie refreshToken para establecer una nueva cookie accessToken. La respuesta JSON es null.',
  security: [{ RefreshTokenCookie: [] }],
  responses: {
    200: nullResponse,
    401: apiErrorResponse('No se recibió la cookie refreshToken.'),
    403: apiErrorResponse('La cookie refreshToken no es válida o la sesión ya no existe.'),
    500: standardAuthErrors[500],
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/token/logout',
  tags: ['Auth'],
  summary: 'Cerrar sesión',
  description: 'Invalida la sesión y limpia las cookies accessToken y refreshToken. Requiere la cookie refreshToken.',
  security: [{ RefreshTokenCookie: [] }],
  responses: {
    200: nullResponse,
    401: apiErrorResponse('No se recibió la cookie refreshToken.'),
    403: apiErrorResponse('La cookie refreshToken no es válida.'),
    500: standardAuthErrors[500],
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/auth/{id}',
  tags: ['Auth'],
  summary: 'Eliminar un usuario',
  description: 'Elimina lógicamente un usuario. Requiere que el usuario autenticado tenga el rol admin.',
  security: [{ AccessTokenCookie: [] }],
  request: { params: paramsUuidv4IdSchema },
  responses: {
    200: nullResponse,
    ...standardAuthErrors,
    404: apiErrorResponse('No se encontró el usuario o ya fue eliminado.'),
  },
});
