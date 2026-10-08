/** Query-shape detection for the Add-Token search flow (PLAN §10). */

export type QueryKind = 'contract' | 'text';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SUI_ADDRESS = /^0x[0-9a-fA-F]{64}$/;
// Base58 without 0/O/I/l — Solana and similar chains (32–44 chars).
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function looksLikeContractAddress(raw: string): boolean {
  const q = raw.trim();
  return EVM_ADDRESS.test(q) || SUI_ADDRESS.test(q) || BASE58_ADDRESS.test(q);
}

export function detectQueryKind(raw: string): QueryKind {
  return looksLikeContractAddress(raw) ? 'contract' : 'text';
}

/** Case-sensitive compare for most chains; EVM hex compares case-insensitively. */
export function sameContract(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith('0x') && b.startsWith('0x')) return a.toLowerCase() === b.toLowerCase();
  return false;
}

/** Shortened display form, e.g. `0x1234…abcd`. Full value stays available via copy. */
export function shortenContract(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars + (address.startsWith('0x') ? 2 : 0))}…${address.slice(-chars)}`;
}
