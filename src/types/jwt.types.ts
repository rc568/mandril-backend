import type { JwtPayload } from 'jsonwebtoken';
import type { UserRole } from '../domain/constants';

export interface CustomPayload {
  userName: string;
  role: UserRole;
}

export type Payload = CustomPayload & JwtPayload;
