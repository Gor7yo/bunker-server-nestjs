import * as Sentry from '@sentry/node';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  type Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { SENTRY_DSN } from './env';

/**
 * Error monitoring. Off unless SENTRY_DSN is set, so local runs and tests
 * send nothing. Imported right after ./env in main.ts.
 */
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    // Errors only — no performance tracing.
    tracesSampleRate: 0,
  });
}

/** Logs an unexpected error and reports it to Sentry. */
export const logError = (logger: Logger, error: unknown) => {
  logger.error(error);
  if (SENTRY_DSN) Sentry.captureException(error);
};

/** HTTP: reports crashes (not 4xx answers), then responds as Nest does. */
@Catch()
export class ReportingExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (SENTRY_DSN && !(exception instanceof HttpException)) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}
