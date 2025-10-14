export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  nextPage: number | null;
  prevPage: number | null;
}
