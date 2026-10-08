import { Request, Response } from 'express';

export function notFoundMiddleware(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}
