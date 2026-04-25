import { and, count, eq, isNull } from 'drizzle-orm';
import { db, orderTable, salesChannelTable, type Transaction } from '@/shared/db';
import { CustomError, errorCodes, errorMessages } from '@/shared/domain';
import { createColumnReferences } from '@/shared/utils';
import type { SaleChannelDto, SaleChannelUpdateDto } from './schemas/sales-channel.schema';

const columnsToSelect = {
  id: true,
  channel: true,
  createdAt: true,
  createdBy: true,
} as const;

export class SalesChannelService {
  private channelExists = async (channel: string, tx: Transaction) => {
    return await tx.query.salesChannelTable.findFirst({
      where: eq(salesChannelTable.channel, channel),
      columns: { id: true },
    });
  };

  getAll = async () => {
    return await db.query.salesChannelTable.findMany({
      columns: columnsToSelect,
      limit: 50,
      where: isNull(salesChannelTable.deletedAt),
    });
  };

  getById = async (id: number, tx?: Transaction) => {
    const executor = tx ?? db;
    const saleChannel = await executor.query.salesChannelTable.findFirst({
      columns: columnsToSelect,
      where: and(isNull(salesChannelTable.deletedAt), eq(salesChannelTable.id, id)),
    });

    if (!saleChannel) throw CustomError.notFound(errorMessages.salesChannel.notFound);

    return saleChannel;
  };

  create = async (saleChannelDto: SaleChannelDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const { channel } = saleChannelDto;
      if (await this.channelExists(channel, tx)) throw CustomError.conflict(errorMessages.salesChannel.channelExists);

      const [newSaleChannel] = await tx
        .insert(salesChannelTable)
        .values({ ...saleChannelDto, createdBy: userId })
        .returning(createColumnReferences(columnsToSelect, salesChannelTable));

      return newSaleChannel;
    });
  };

  update = async (id: number, saleChannelDto: SaleChannelUpdateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      await this.getById(id);

      const { channel } = saleChannelDto;
      if (channel && (await this.channelExists(channel, tx)))
        throw CustomError.conflict(errorMessages.salesChannel.channelExists);

      const [updateSaleChannel] = await tx
        .update(salesChannelTable)
        .set({ ...saleChannelDto, updatedBy: userId })
        .where(eq(salesChannelTable.id, id))
        .returning(createColumnReferences(columnsToSelect, salesChannelTable));

      return updateSaleChannel;
    });
  };

  softDelete = async (id: number, userId: string, force = false): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      await this.getById(id, tx);

      if (force) {
        await tx
          .update(salesChannelTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(salesChannelTable.id, id));
      } else {
        const [countOrder] = await tx
          .select({ count: count() })
          .from(orderTable)
          .where(and(isNull(orderTable.deletedAt), eq(orderTable.salesChannelId, id)));

        if (countOrder.count > 0) {
          throw CustomError.conflict(
            errorMessages.salesChannel.hasActiveOrders,
            errorCodes.SALES_CHANNEL_HAS_ACTIVE_ORDERS,
          );
        }
      }

      return true;
    });
  };
}
