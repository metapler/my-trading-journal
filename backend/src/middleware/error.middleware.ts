import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { CalculationError } from '../modules/portfolio/calculations';
import { PriceProviderError } from '../modules/prices/errors';
import { ApiError } from '../utils/apiError';

function statusForCalc(code: string): number {
  return code === 'INSUFFICIENT_POSITION' ? 422 : 400;
}

function statusForPrice(code: string, hint?: number): number {
  switch (code) {
    case 'INVALID_QUERY':
    case 'MISSING_IDENTIFIER':
      return 400;
    case 'ASSET_NOT_FOUND':
      return 404;
    case 'PROVIDER_NOT_CONFIGURED':
      return 503;
    case 'PROVIDER_RATE_LIMITED':
      return 502;
    case 'PROVIDER_TIMEOUT':
    case 'PROVIDER_UNAVAILABLE':
    case 'PROVIDER_BAD_RESPONSE':
      return hint ?? 502;
    default:
      return 502;
  }
}

/**
 * Centralized error serializer (PLAN §10/§14). All known errors become
 * { error: { code, message } }. Stack traces never leave the server in
 * production. Unknown errors become INTERNAL_ERROR/500.
 */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, code: err.code }, 'API error');
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Invalid input.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
      },
    });
    return;
  }

  if (err instanceof CalculationError) {
    res.status(statusForCalc(err.code)).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof PriceProviderError) {
    if (err.code === 'PROVIDER_UNAVAILABLE' || err.retryable) {
      logger.warn({ provider: err.provider, code: err.code }, 'Price provider failure');
    }
    res
      .status(statusForPrice(err.code, err.statusHint))
      .json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Body-parser failures (malformed JSON, oversize payload). Without this,
  // express.json() errors fall through to the 500 branch.
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type: unknown }).type;
    const bodyErr = err as { status?: unknown; message?: unknown };
    if (type === 'entity.too.large' || bodyErr.status === 413) {
      res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 100kb limit.' } });
      return;
    }
    if (
      type === 'entity.parse.failed' ||
      (typeof bodyErr.message === 'string' && /unexpected token|expected .* in json/i.test(bodyErr.message))
    ) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' } });
      return;
    }
  }

  // Prisma errors — normalized, never raw.
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    // Unique violations (e.g. duplicate chain+contract) → 409.
    if (code === 'P2002') {
      res
        .status(409)
        .json({ error: { code: 'DUPLICATE_ASSET', message: 'An asset with this identity already exists.' } });
      return;
    }
    // Record-not-found races (deleted between read and write) → 404.
    if (code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
      return;
    }
    // Any other DB failure → generic 500 without driver details.
    logger.error({ prismaCode: code }, 'Prisma error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'Internal server error.' : err instanceof Error ? err.message : 'Internal server error.',
    },
  });
}
