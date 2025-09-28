import z from 'zod';
import { USER_PASSWORD_REGEX, USER_ROLES_ARRAY } from '../../domain/constants';

const userSchema = z.object({
  name: z.string().min(2).max(100),
  lastName: z.string().max(100),
  password: z.string().min(8).max(128).regex(USER_PASSWORD_REGEX),
  userName: z.string().min(4).max(50),
  email: z.email().max(100),
  role: z.enum(USER_ROLES_ARRAY),
  isActive: z.boolean().default(true),
});

const userLoginSchema = userSchema.pick({ userName: true, password: true });

export const registerUserSchema = z.object({
  body: userSchema,
});

export const loginUserSchema = z.object({
  body: userLoginSchema,
});

export type UserDto = z.infer<typeof userSchema>;
export type UserLoginDto = z.infer<typeof userLoginSchema>;
