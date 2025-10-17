import type { USER_ROLES } from '.';

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
