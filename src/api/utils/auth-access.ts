import type { RequestHandler } from 'express-serve-static-core';
import { authenticateToken, roleAuthorization } from '../middlewares';

export const protectedRoute: RequestHandler[] = [authenticateToken];
export const adminAccess: RequestHandler[] = [authenticateToken, roleAuthorization(['admin'])];
export const adminEmployeeAccess: RequestHandler[] = [authenticateToken, roleAuthorization(['admin', 'employee'])];
