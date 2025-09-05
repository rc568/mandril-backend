export interface ApiResponse {
  data: object | object[] | null;
  errors: string[] | string | null;
  success: boolean;
  statusCode?: number;
  message?: string;
}
