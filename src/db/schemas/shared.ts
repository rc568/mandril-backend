import { userAudit as userAuditFn } from '../helpers/columns.helpers';
import { userTable } from './user.schema';

export const userAudit = userAuditFn(userTable);
