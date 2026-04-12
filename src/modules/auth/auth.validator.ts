import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType } from '@/shared/validators';
import { USER_PASSWORD_REGEX, USER_ROLES_ARRAY, USERNAME_REGEX } from './domain';

export const registerUserSchema = z.object({
  name: baseStringType.min(2).max(100),
  lastName: baseStringType.max(100),
  password: z.string().min(8).max(128).regex(USER_PASSWORD_REGEX, errorMessages.auth.passwordRegex),
  userName: baseStringType.min(4).max(50).regex(USERNAME_REGEX, errorMessages.auth.userNameRegex),
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
