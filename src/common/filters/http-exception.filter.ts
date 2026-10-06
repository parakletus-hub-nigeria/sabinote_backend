import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.correlationId || (request.headers['x-correlation-id'] as string) || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal server error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        message = resObj.message || exception.message;

        // If class-validator returned an array of messages
        if (Array.isArray(resObj.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed';
          details = resObj.message;
        } else if (resObj.error) {
          code = String(resObj.error).toUpperCase().replace(/\s+/g, '_');
        }
      }

      if (code === 'INTERNAL_SERVER_ERROR') {
        switch (status) {
          case HttpStatus.BAD_REQUEST:
            code = code === 'INTERNAL_SERVER_ERROR' ? 'BAD_REQUEST' : code;
            break;
          case HttpStatus.UNAUTHORIZED:
            code = 'UNAUTHORIZED';
            break;
          case HttpStatus.FORBIDDEN:
            code = 'FORBIDDEN';
            break;
          case HttpStatus.NOT_FOUND:
            code = 'NOT_FOUND';
            break;
          case HttpStatus.CONFLICT:
            code = 'CONFLICT';
            break;
          case HttpStatus.UNPROCESSABLE_ENTITY:
            code = 'UNPROCESSABLE_ENTITY';
            break;
          case HttpStatus.TOO_MANY_REQUESTS:
            code = 'RATE_LIMITED';
            break;
          default:
            code = `HTTP_${status}`;
        }
      }
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'production' ? 'An internal error occurred' : exception.message;
      this.logger.error(
        `[${correlationId}] Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`[${correlationId}] Unknown error thrown: ${JSON.stringify(exception)}`);
    }

    // Always log non-2xx status with correlation ID
    if (status >= 500) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} -> ${status} [${code}]: ${message}`,
      );
    } else {
      this.logger.warn(
        `[${correlationId}] ${request.method} ${request.url} -> ${status} [${code}]: ${message}`,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        details,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
