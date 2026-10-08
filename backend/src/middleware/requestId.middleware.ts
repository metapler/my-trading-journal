import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Phase 26 — request id (PLAN §26). Honors an inbound X-Request-Id (up to
 * 128 chars, safe charset only) or mints a UUID. The id is echoed on the
 * response so clients can correlate errors with server logs.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const inbound = req.get(REQUEST_ID_HEADER)?.trim() ?? '';
  const id =
    inbound.length > 0 && inbound.length <= 128 && /^[A-Za-z0-9\-_:.]+$/.test(inbound)
      ? inbound
      : randomUUID();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
