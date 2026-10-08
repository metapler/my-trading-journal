import bcrypt from 'bcryptjs';

const ROUNDS = 12;

/** bcrypt hash (PLAN §21: Argon2/bcrypt). Cost 12 balances login latency vs brute-force resistance. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

/** Constant-time compare; legacy MIGRATED_NO_LOGIN hashes always fail. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (!hash.startsWith('$2')) return false;
    return bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
