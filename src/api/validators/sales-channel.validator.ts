import { z } from '../../libs/zod';
import { baseStringType } from './common.validator';
export const createSaleChannelSchema = z.object({
  channel: baseStringType.max(25),
});

export const updateSaleChannelSchema = createSaleChannelSchema.partial();

export type SaleChannelDto = z.infer<typeof createSaleChannelSchema>;
export type SaleChannelUpdateDto = Partial<SaleChannelDto>;
