import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType } from '@/shared/validators';
import { USER_PASSWORD_REGEX, USER_ROLES_ARRAY, USERNAME_REGEX } from './domain';

export const registerUserSchema = z.object({
  name: baseStringType.min(2).max(100).describe('Nombre. Se eliminan espacios al inicio y al final.'),
  lastName: baseStringType.max(100).describe('Apellido. Se eliminan espacios al inicio y al final.'),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(USER_PASSWORD_REGEX, errorMessages.auth.passwordRegex)
    .describe('Contraseña de 8 a 128 caracteres, con al menos una mayúscula, una minúscula y un número.'),
  userName: baseStringType
    .min(4)
    .max(50)
    .regex(USERNAME_REGEX, errorMessages.auth.userNameRegex)
    .describe('Username de 4 a 50 caracteres; solo acepta letras minúsculas y números.'),
  email: z.email().max(100).describe('Correo electrónico de hasta 100 caracteres.'),
  role: z.enum(USER_ROLES_ARRAY, errorMessages.auth.invalidRole).describe('Rol que se asignará al usuario.'),
});
export const loginUserSchema = registerUserSchema
  .pick({ userName: true, password: true })
  .extend({ password: z.string().describe('Contraseña de la cuenta.') });

export const updateUserSchema = registerUserSchema.partial().omit({ password: true, userName: true, role: true });

export type RegisterUserDto = z.infer<typeof registerUserSchema>;
export type LoginUserDto = z.infer<typeof loginUserSchema>;

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
