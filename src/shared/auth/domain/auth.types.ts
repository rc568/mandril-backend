import type { USER_ROLES } from './auth.constants';

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
