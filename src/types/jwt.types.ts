import type { JwtPayload } from 'jsonwebtoken';
import type { UserRole } from '../domain/constants';

export interface CustomPayload {
  id: string;
  userName: string;
  role: UserRole;
}

export type Payload = CustomPayload & JwtPayload;

export type RefreshPayload = Omit<Payload, 'id'>;
