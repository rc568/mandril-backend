import { and, asc, count, eq, ilike } from 'drizzle-orm';
import { db, supplierTable, type Transaction } from '@/shared/db';
import { CustomError, DEFAULT_LIMIT, DEFAULT_PAGE, errorMessages, PAGINATION_LIMITS } from '@/shared/domain';
import { calculatePagination, isOneOf } from '@/shared/utils';
import type { GetSuppliersQuery, SupplierCreateDto, SupplierUpdateDto } from './schemas/supplier.schema';

export class SupplierService {
  getAll = async (query: GetSuppliersQuery) => {
    const requestedPage = query.page ?? DEFAULT_PAGE;
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : DEFAULT_PAGE;
    const limit = isOneOf(query.limit, PAGINATION_LIMITS) ? query.limit : DEFAULT_LIMIT;
    // Treat search input as literal text, not as SQL wildcard patterns.
    const search = query.search?.trim().replace(/[\\%_]/g, '\\$&');
    const conditions = and(
      search ? ilike(supplierTable.name, `%${search}%`) : undefined,
      query.isActive !== undefined ? eq(supplierTable.isActive, query.isActive) : undefined,
    );

    const [total] = await db.select({ count: count() }).from(supplierTable).where(conditions);
    const pagination = calculatePagination(total.count, page, limit);
    if (pagination.totalItems === 0) return { pagination, suppliers: [] };

    const suppliers = await db
      .select()
      .from(supplierTable)
      .where(conditions)
      .orderBy(asc(supplierTable.name), asc(supplierTable.id))
      .limit(limit)
      .offset((page - 1) * limit);
    return { pagination, suppliers };
  };

  getById = async (id: string, tx?: Transaction) => {
    const executor = tx ?? db;
    const supplier = await executor.query.supplierTable.findFirst({ where: eq(supplierTable.id, id) });
    if (!supplier) throw CustomError.notFound(errorMessages.supplier.notFound);
    return supplier;
  };

  create = async (dto: SupplierCreateDto, userId: string) => {
    const [supplier] = await db
      .insert(supplierTable)
      .values({ ...dto, createdBy: userId })
      .returning();
    return supplier;
  };

  update = async (id: string, dto: SupplierUpdateDto, userId: string) => {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw CustomError.badRequest(errorMessages.common.bodyEmpty);
    }
    // A single UPDATE preserves omitted fields and avoids a separate existence check.
    const [supplier] = await db
      .update(supplierTable)
      .set({ ...dto, updatedBy: userId })
      .where(eq(supplierTable.id, id))
      .returning();
    if (!supplier) throw CustomError.notFound(errorMessages.supplier.notFound);
    return supplier;
  };
}
