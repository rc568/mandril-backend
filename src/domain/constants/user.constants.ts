export const USER_ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  CUSTOMER: 'customer',
} as const;

export const USER_ROLES_ARRAY = Object.values(USER_ROLES);
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const USERNAME_REGEX = /^[a-z0-9]{4,}$/;
