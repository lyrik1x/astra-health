import { STATUS_CODES } from "node:http";
import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { ApiError } from "@astra/contracts";
import { ApiErrorException } from "./api-error.exception.js";

/** Minimal shape of the Express response used here (avoids depending on @types/express). */
interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

const INTERNAL_ERROR: ApiError = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  error: "INTERNAL_ERROR",
  message: "Internal server error",
};

/** "Method Not Allowed" -> "METHOD_NOT_ALLOWED" (stable uppercase code, T-005 §5.3). */
function codeFromStatus(status: number): string {
  const text = STATUS_CODES[status] ?? "HTTP_ERROR";
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Translates any error into the common `ApiError` format (T-005 §2.8, QA-704).
 * Only our own `ApiErrorException` may carry `details` (Zod messages about the client input).
 * Every other message is fixed: internal messages and traces never reach the client.
 */
export function toApiError(exception: unknown): ApiError {
  if (exception instanceof ApiErrorException) {
    return exception.getApiError();
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    switch (status) {
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return { statusCode: status, error: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
      case HttpStatus.BAD_REQUEST:
        // For example, malformed JSON rejected by body-parser.
        return { statusCode: status, error: "VALIDATION_FAILED", message: "Invalid request" };
      case HttpStatus.NOT_FOUND:
        return { statusCode: status, error: "NOT_FOUND", message: "Resource not found" };
    }
    if (status >= 400 && status < 500) {
      return { statusCode: status, error: codeFromStatus(status), message: STATUS_CODES[status] ?? "Request error" };
    }
  }
  return INTERNAL_ERROR;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toApiError(exception);
    if (body.statusCode >= 500 && !(exception instanceof ApiErrorException)) {
      // The trace stays in the server log only.
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }
    host.switchToHttp().getResponse<JsonResponse>().status(body.statusCode).json(body);
  }
}
