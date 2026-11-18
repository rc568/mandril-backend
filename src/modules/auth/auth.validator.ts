import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType } from '@/shared/validators';
import { USER_PASSWORD_REGEX, USER_ROLES_ARRAY, USERNAME_REGEX } from './domain';

export const registerUserSchema = z.object({
  name: baseStringType.min(2).max(100).describe('Nombre que se mostrará en el perfil del usuario.'),
  lastName: baseStringType.max(100).describe('Apellido que se mostrará en el perfil del usuario.'),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(USER_PASSWORD_REGEX, errorMessages.auth.passwordRegex)
    .describe('Contraseña de inicio de sesión. La API no la devuelve en sus respuestas.'),
  userName: baseStringType
    .min(4)
    .max(50)
    .regex(USERNAME_REGEX, errorMessages.auth.userNameRegex)
    .describe('Identificador único que se utiliza para iniciar sesión.'),
  email: z.email().max(100).describe('Correo principal asociado a la cuenta.'),
  role: z
    .enum(USER_ROLES_ARRAY, errorMessages.auth.invalidRole)
    .describe('Rol que determina los permisos de la cuenta.'),
});
export const loginUserSchema = registerUserSchema
  .pick({ userName: true, password: true })
  .extend({ password: z.string().describe('Contraseña de la cuenta.') });

export const updateUserSchema = registerUserSchema.partial().omit({ password: true, userName: true, role: true });

export type RegisterUserDto = z.infer<typeof registerUserSchema>;
export type LoginUserDto = z.infer<typeof loginUserSchema>;

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
