import { z } from '@/shared/libs';
import { baseStringType } from '@/shared/validators';

export const createSaleChannelSchema = z.object({
  channel: baseStringType.max(25),
});

export const updateSaleChannelSchema = createSaleChannelSchema.partial();

export type SaleChannelDto = z.infer<typeof createSaleChannelSchema>;
export type SaleChannelUpdateDto = Partial<SaleChannelDto>;
