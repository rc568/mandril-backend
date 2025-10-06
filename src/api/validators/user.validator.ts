import { errorMessages, USER_PASSWORD_REGEX, USER_ROLES_ARRAY, USERNAME_REGEX } from '../../domain/constants';
import { z } from '../../libs/zod';

export const registerUserSchema = z.object({
  name: z.string().min(2).max(100),
  lastName: z.string().max(100),
  password: z.string().min(8).max(128).regex(USER_PASSWORD_REGEX, errorMessages.auth.passwordRegex),
  userName: z.string().min(4).max(50).regex(USERNAME_REGEX, errorMessages.auth.userNameRegex),
  email: z.email().max(100),
  role: z.enum(USER_ROLES_ARRAY, errorMessages.auth.invalidRole),
});
export const loginUserSchema = registerUserSchema
  .pick({ userName: true, password: true })
  .extend({ password: z.string() });

export const updateUserSchema = registerUserSchema.partial().omit({ password: true, userName: true, role: true });

export type RegisterUserDto = z.infer<typeof registerUserSchema>;
export type LoginUserDto = z.infer<typeof loginUserSchema>;

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
