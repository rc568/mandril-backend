import {
  creationAudit as creationAuditFn,
  softDeleteAudit as softDeleteAuditFn,
  updateAudit as updateAuditFn,
  userAudit as userAuditFn,
} from '../utils/drizzle-columns';
import { userTable } from './user.schema';

export const userAudit = userAuditFn(userTable);
export const creationAudit = creationAuditFn(userTable);
export const updateAudit = updateAuditFn(userTable);
export const softDeleteAudit = softDeleteAuditFn(userTable);
