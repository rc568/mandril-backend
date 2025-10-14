import type { Pagination } from '../../domain/shared';

export const calculatePagination = (total: number, currPage: number, limit: number): Pagination => {
  const totalPages = Math.ceil(total / limit);

  if (currPage > totalPages || currPage <= 0) {
    return {
      page: 1,
      pageSize: limit,
      totalItems: 0,
      totalPages: 0,
      nextPage: null,
      prevPage: null,
    };
  }

  return {
    page: currPage,
    pageSize: limit,
    totalItems: total,
    totalPages: totalPages,
    nextPage: currPage === totalPages ? null : currPage + 1,
    prevPage: currPage === 1 ? null : currPage - 1,
  };
};
