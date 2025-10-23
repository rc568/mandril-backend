import { CLIENT_DOCUMENT_TYPE } from '../../domain/order';
import { z } from '../../libs/zod';

export const clientSchema = z.object({
  id: z.uuid(),
  documentType: z.enum(CLIENT_DOCUMENT_TYPE),
  documentNumber: z.string(),
  bussinessName: z.string(),
  contactName: z.string(),
  email: z.email().optional(),
  phoneNumber1: z.string().optional(),
  phoneNumber2: z.string().optional(),
});

export type ClientDto = z.infer<typeof clientSchema>;
