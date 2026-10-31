import { CLIENT_ORIGIN } from './env';
import { ReportingExceptionFilter } from './monitoring';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RATE_LIMIT_MESSAGE, RateLimiter, clientIp } from './common/rate-limit';
import type { NextFunction, Request, Response } from 'express';

/** Public HTTP endpoints (/rooms, /catalog): per IP. */
const httpLimiter = new RateLimiter(120, 2);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: CLIENT_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  app.useGlobalFilters(
    new ReportingExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (httpLimiter.take(clientIp(req.headers, req.socket.remoteAddress))) {
      return next();
    }
    res.status(429).json({ statusCode: 429, message: RATE_LIMIT_MESSAGE });
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
