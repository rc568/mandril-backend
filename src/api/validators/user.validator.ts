import { errorMessages, USER_PASSWORD_REGEX, USER_ROLES_ARRAY, USERNAME_REGEX } from '../../domain/constants';
import { z } from '../../libs/zod';

const userSchema = z.object({
  name: z.string().min(2).max(100),
  lastName: z.string().max(100),
  password: z.string().min(8).max(128).regex(USER_PASSWORD_REGEX, errorMessages.auth.passwordRegex),
  userName: z.string().min(4).max(50).regex(USERNAME_REGEX, errorMessages.auth.userNameRegex),
  email: z.email().max(100),
  role: z.enum(USER_ROLES_ARRAY, errorMessages.auth.invalidRole),
});

const userLoginSchema = userSchema.pick({ userName: true, password: true }).extend({ password: z.string() });

export const registerUserSchema = z.object({
  body: userSchema,
});

export const loginUserSchema = z.object({
  body: userLoginSchema,
});

export const deleteUserSchema = z.object({
  params: z.object({ id: z.uuidv4() }),
});

export const updateUserSchema = z.object({
  body: userSchema.partial().omit({ password: true, userName: true, role: true }),
  params: z.object({ id: z.uuidv4() }),
});

export type UserDto = z.infer<typeof userSchema>;
export type UserLoginDto = z.infer<typeof userLoginSchema>;

export type UpdateUserDto = z.infer<typeof updateUserSchema>['body'];
