import type { NextFunction, Request, Response } from 'express';
import type { z, ZodTypeAny } from 'zod';

/** Request with a Zod-parsed query attached by validateQuery(). */
export type ValidatedRequest<T extends ZodTypeAny> = Request & { validatedQuery: z.infer<T> };

/**
 * Validate req.query against a Zod schema and attach the parsed result to
 * req.validatedQuery. Replaces ad-hoc manual checks in controllers so every
 * query param is covered by Zod (PLAN §10/§14).
 */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req as Request & { validatedQuery?: unknown }).validatedQuery = schema.parse(req.query);
      next();
    } catch (e) {
      next(e);
    }
  };
}
