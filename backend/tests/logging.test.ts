import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { LOG_REDACT_PATHS } from '../src/config/logger';

const app = createApp();

// ---------------------------------------------------------------------------
// Phase 26 — request id (PLAN §26)
// ---------------------------------------------------------------------------

describe('logging — request id', () => {
  it('mints a UUID request id and echoes it on the response', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    const id = res.headers['x-request-id'] as string | undefined;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('honors a safe inbound X-Request-Id', async () => {
    const res = await request(app).get('/api/health').set('x-request-id', 'client-trace-123');
    expect(res.headers['x-request-id']).toBe('client-trace-123');
  });

  it('rejects unsafe inbound ids (mint fresh instead)', async () => {
    // Newlines never reach the app (Node rejects them at the transport), so
    // exercise the middleware regex with an over-long + spaced value instead.
    const res = await request(app)
      .get('/api/health')
      .set('x-request-id', `has spaces and is ${'x'.repeat(200)}`);
    const id = res.headers['x-request-id'] as string;
    expect(id).not.toContain(' ');
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('echoes request id on error responses for correlation', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 26 — secret redaction (PLAN §26 must-never-log list)
// ---------------------------------------------------------------------------

describe('logging — secret redaction', () => {
  function logged(): string {
    const chunks: string[] = [];
    const sink = { write: (s: string) => void chunks.push(s) };
    // Sibling logger with the identical redact paths as the app logger.
    // Paths live in one place (LOG_REDACT_PATHS) so config and test agree.
    const probe = pino({ level: 'info', redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    probe.info(
      {
        req: {
          body: { email: 'a@example.com', password: 'TestPassword123!', confirm: 'TestPassword123!' },
          headers: {
            authorization: 'Bearer full-header-secret-zzz',
            cookie: 'tj_session=abc.def.ghi-secret-zzz',
            'x-csrf-token': 'csrf-secret-value-zzz',
          },
        },
        password: 'plain-secret-zzz',
        passwordHash: 'hash-value-zzz',
        apiKey: 'key-value-zzz',
        secret: 'secret-value-zzz',
        csrfToken: 'csrf-value-zzz',
        tokenHash: 'tokenhash-value-zzz',
        cookieValue: 'cookie-value-zzz',
      },
      'probe',
    );
    return chunks.join('\n');
  }

  it('redacts passwords, keys, tokens, cookies, auth headers', () => {
    const out = logged();
    for (const secret of [
      'TestPassword123!',
      'Bearer full-header-secret-zzz',
      'tj_session=abc.def.ghi-secret-zzz',
      'csrf-secret-value-zzz',
      'plain-secret-zzz',
      'hash-value-zzz',
      'key-value-zzz',
      'secret-value-zzz',
      'csrf-value-zzz',
      'tokenhash-value-zzz',
      'cookie-value-zzz',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[REDACTED]');
    // Non-secret context survives.
    expect(out).toContain('a@example.com');
  });
});
