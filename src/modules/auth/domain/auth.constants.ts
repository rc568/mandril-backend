import { USER_ROLES } from '../../../shared/auth/domain/auth.constants';

export const USER_ROLES_ARRAY = Object.values(USER_ROLES);

export const USER_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const USERNAME_REGEX = /^[a-z0-9]{4,}$/;
