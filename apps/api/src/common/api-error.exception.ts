import { HttpException } from "@nestjs/common";
import type { ApiError } from "@astra/contracts";

/**
 * Error thrown by our own code with the exact `ApiError` body (T-005 §2.8).
 * The global filter returns it as is.
 */
export class ApiErrorException extends HttpException {
  constructor(statusCode: number, error: string, message: string, details?: string[]) {
    const body: ApiError = details === undefined ? { statusCode, error, message } : { statusCode, error, message, details };
    super(body, statusCode);
  }

  getApiError(): ApiError {
    return this.getResponse() as ApiError;
  }
}
