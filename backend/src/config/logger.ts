import pino from 'pino';

/**
 * Phase 26 — redaction paths (PLAN §26 must-never-log list).
 * Single source of truth shared by the app logger and its tests.
 */
export const LOG_REDACT_PATHS = [
  // Request/response bodies and headers.
  'req.body.password',
  'req.body.confirm',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  // Error objects and misc payloads. Both top-level and nested forms —
  // pino's `*.key` does not match a top-level `key`.
  'err.config.headers',
  'password',
  'passwordHash',
  'apiKey',
  'api_key',
  'secret',
  'csrfToken',
  'tokenHash',
  'cookieValue',
  '*.password',
  '*.passwordHash',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.csrfToken',
  '*.tokenHash',
  '*.cookieValue',
  'authorization',
  'cookie',
];

/**
 * Centralized logger.
 *
 * MUST log: request id, method, path, status, duration (via pino-http),
 * provider failures, unexpected exceptions.
 *
 * MUST NEVER log: API keys, passwords, session tokens, full auth headers.
 * Redaction below is defense-in-depth — no code path should log these
 * fields at all, but if one does, the values are stripped at serialization.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: LOG_REDACT_PATHS,
    censor: '[REDACTED]',
  },
});
