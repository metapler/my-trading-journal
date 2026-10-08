import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { assetsRouter } from './controllers/assets.controller';
import { authRouter } from './controllers/auth.controller';
import { dcaRouter } from './controllers/dca.controller';
import { healthRouter } from './controllers/health.controller';
import { journalRouter } from './controllers/journal.controller';
import { portfolioRouter } from './controllers/portfolio.controller';
import { positionsRouter } from './controllers/positions.controller';
import { pricesRouter } from './controllers/prices.controller';
import { transactionsRouter } from './controllers/transactions.controller';
import { watchlistRouter } from './controllers/watchlist.controller';
import { errorMiddleware } from './middleware/error.middleware';
import { notFoundMiddleware } from './middleware/notFound.middleware';
import { apiLimiter, mutationLimiter, searchPriceLimiter } from './middleware/rateLimit.middleware';
import { requireAuth } from './middleware/auth.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Single trusted proxy hop (PLAN §25: rate limits must key on the real
  // client IP when deployed behind a reverse proxy). Localhost direct
  // connections are unaffected.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      // Cookie auth requires explicit credentials (never '*').
      credentials: true,
    }),
  );
  // Request id first so every log line (including body-parser failures) can
  // correlate. Echoed on the response for client-side correlation.
  app.use(requestIdMiddleware);
  // Body size limit (PLAN §25): malformed/oversize JSON is normalized to
  // VALIDATION_ERROR / PAYLOAD_TOO_LARGE by the error middleware.
  app.use(express.json({ limit: '100kb' }));
  // Signed session cookie is HTTP-only; the secret signs tokens, not cookies.
  app.use(cookieParser());
  // Phase 26 — request log: id, method, path, status, duration.
  // Serializers exclude bodies/cookies/headers so secrets never log.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId?: string }).requestId ?? 'unknown',
      customProps: (req) => ({ requestId: (req as unknown as { requestId?: string }).requestId ?? 'unknown' }),
      serializers: {
        req: (req) => ({
          id: (req as unknown as { requestId?: string }).requestId ?? 'unknown',
          method: req.method,
          path: req.url?.split('?')[0] ?? 'unknown',
        }),
        res: (res) => ({ statusCode: res.statusCode }),
        err: (err) => ({ type: err?.constructor?.name, message: err?.message, code: (err as { code?: unknown })?.code }),
      },
    }),
  );

  // Health stays unthrottled (uptime probes); everything else is budgeted.
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', apiLimiter);
  // All data routes require a session (PLAN §21 ownership).
  app.use('/api/prices', searchPriceLimiter, requireAuth, pricesRouter);
  app.use('/api/assets', requireAuth);
  app.use('/api/assets', mutationLimiter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/transactions', mutationLimiter, requireAuth, transactionsRouter);
  app.use('/api/positions', requireAuth, positionsRouter);
  app.use('/api/portfolio', requireAuth, portfolioRouter);
  app.use('/api/dca', requireAuth, mutationLimiter, dcaRouter);
  app.use('/api/journal', requireAuth, mutationLimiter, journalRouter);
  app.use('/api/watchlist', requireAuth, mutationLimiter, watchlistRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
