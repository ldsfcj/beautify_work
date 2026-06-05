/**
 * The standard API response envelope. Every successful response goes
 * through TransformInterceptor and ends up shaped like this; errors
 * go through HttpExceptionFilter and follow the same shape with
 * `data: null` and a non-zero `code`.
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  path?: string;
  timestamp?: string;
}
