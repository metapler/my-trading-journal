import 'dotenv/config';

function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  // Fail fast: session/CSRF signing without a real secret is a deployment bug.
  // Dev convenience: allow a default in non-production only.
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters.');
  }
  return 'dev-only-auth-secret-change-me-before-public-deploy-000';
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  authSecret: requireAuthSecret(),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  sessionCookieName: process.env.SESSION_COOKIE_NAME?.trim() || 'tj_session',
  dexscreenerBaseUrl: process.env.DEXSCREENER_BASE_URL?.trim() || 'https://api.dexscreener.com',
  coinmarketcapBaseUrl: process.env.COINMARKETCAP_BASE_URL?.trim() || 'https://pro-api.coinmarketcap.com',
  coinmarketcapApiKey: process.env.COINMARKETCAP_API_KEY?.trim() || '',
  // PLAN §24: hard timeout per provider request (ms). Bounded retry adds at
  // most (maxAttempts − 1) × timeout extra latency per call.
  providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS ?? 8000),
  providerMaxAttempts: Number(process.env.PROVIDER_MAX_ATTEMPTS ?? 2),
};
