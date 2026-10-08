/** Normalized provider errors — never leak stack traces to clients. */

export const PRICE_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_BAD_RESPONSE: 'PROVIDER_BAD_RESPONSE',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  INVALID_QUERY: 'INVALID_QUERY',
  MISSING_IDENTIFIER: 'MISSING_IDENTIFIER',
} as const;

export type PriceErrorCode = (typeof PRICE_ERROR_CODES)[keyof typeof PRICE_ERROR_CODES];

export class PriceProviderError extends Error {
  readonly code: PriceErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly statusHint?: number;

  constructor(opts: { code: PriceErrorCode; provider: string; message: string; retryable?: boolean; statusHint?: number }) {
    super(`[${opts.provider}] ${opts.message}`);
    this.name = 'PriceProviderError';
    this.code = opts.code;
    this.provider = opts.provider;
    this.retryable = opts.retryable ?? false;
    this.statusHint = opts.statusHint;
  }
}
