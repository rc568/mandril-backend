import { and, count, eq, isNull } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { orderTable, salesChannelTable } from '../../db/schemas';
import { CustomError, errorCodes } from '../../domain/errors';
import { errorMessages } from '../../domain/messages';
import { createColumnReferences } from '../utils';
import type { SaleChannelDto, SaleChannelUpdateDto } from '../validators/sales-channel.validator';

const columnsToSelect = {
  id: true,
  channel: true,
  createdAt: true,
  createdBy: true,
} as const;

export class SalesChannelService {
  private channelExists = async (channel: string, tx?: Transaction) => {
    const executor = tx ?? db;

    return await executor.query.salesChannelTable.findFirst({
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

  create = async (saleChannel: SaleChannelDto, userId: string) => {
    const { channel } = saleChannel;
    if (await this.channelExists(channel)) throw CustomError.conflict(errorMessages.salesChannel.channelExists);

    const [newSaleChannel] = await db
      .insert(salesChannelTable)
      .values({ ...saleChannel, createdBy: userId })
      .returning(createColumnReferences(columnsToSelect, salesChannelTable));

    return newSaleChannel;
  };

  update = async (id: number, data: SaleChannelUpdateDto, userId: string) => {
    await this.getById(id);

    const { channel } = data;
    if (channel && (await this.channelExists(channel)))
      throw CustomError.conflict(errorMessages.salesChannel.channelExists);

    const [updateSaleChannel] = await db
      .update(salesChannelTable)
      .set({ ...data, updatedBy: userId })
      .where(eq(salesChannelTable.id, id))
      .returning(createColumnReferences(columnsToSelect, salesChannelTable));

    return updateSaleChannel;
  };

  softDelete = async (id: number, userId: string, force = false): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      await this.getById(id, tx);

      const [countOrder] = await tx
        .select({ count: count() })
        .from(orderTable)
        .where(and(isNull(orderTable.deletedAt), eq(orderTable.salesChannelId, id)));

      if (!force && countOrder.count > 0) {
        throw CustomError.conflict(
          errorMessages.salesChannel.hasActiveOrders,
          errorCodes.SALES_CHANNEL_HAS_ACTIVE_ORDERS,
        );
      }

      await tx
        .update(salesChannelTable)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(salesChannelTable.id, id));

      return true;
    });
  };
}
