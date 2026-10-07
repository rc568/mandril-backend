import {
  creationAudit as creationAuditFn,
  modificationAudit as modificationAuditFn,
  softDeleteAudit as softDeleteAuditFn,
  updateAudit as updateAuditFn,
} from '../utils/drizzle-columns';
import { userTable } from './user.schema';

export const creationAudit = creationAuditFn(userTable);
export const updateAudit = updateAuditFn(userTable);
export const softDeleteAudit = softDeleteAuditFn(userTable);
export const modificationAudit = modificationAuditFn(userTable);
