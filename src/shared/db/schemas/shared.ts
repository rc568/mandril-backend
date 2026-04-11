import { userAudit as userAuditFn } from '../utils/drizzle-columns';
import { userTable } from './user.schema';

export const userAudit = userAuditFn(userTable);
