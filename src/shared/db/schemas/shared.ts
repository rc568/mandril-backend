import {
  creationAudit as creationAuditFn,
  onlyUpdateAudit as onlyUpdateAuditFn,
  softDeleteAudit as softDeleteAuditFn,
  updateAudit as updateAuditFn,
} from '../utils/drizzle-columns';
import { userTable } from './user.schema';

export const creationAudit = creationAuditFn(userTable);
export const updateAudit = updateAuditFn(userTable);
export const softDeleteAudit = softDeleteAuditFn(userTable);
export const onlyUpdateAudit = onlyUpdateAuditFn(userTable);
