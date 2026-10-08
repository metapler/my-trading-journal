import { getPrisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { capturePortfolioSnapshot } from './history';
import { getTestClientOverride } from './service';

const ADVISORY_LOCK_KEY = 'portfolio_snapshot_job';

/**
 * REDESIGN §9.2 — host-process snapshot job. Runs every 5 minutes inside the
 * existing backend process (no new Docker service, no Redis). Iterates over
 * owners with ledger activity and captures one observed snapshot per 5-min
 * bucket each. First-write-wins per bucket keeps two tabs/workers from
 * duplicating; a pg advisory lock keeps multi-instance deploys single-runner
 * so provider requests don't multiply.
 */
export async function runSnapshotPass(now = new Date()): Promise<{ users: number; captured: number }> {
  const client = getTestClientOverride() ?? getPrisma();

  // Single-runner: skip the whole pass when another instance holds the lock.
  try {
    const rows = await client.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${ADVISORY_LOCK_KEY})) AS locked
    `;
    if (!rows[0]?.locked) {
      logger.info('Snapshot pass skipped: lock held by another instance.');
      return { users: 0, captured: 0 };
    }
  } catch (e) {
    logger.warn({ err: e }, 'Snapshot advisory lock unavailable; running unlocked.');
  }

  try {
    // Owners with any ledger activity.
    const owners = await client.transaction.findMany({
      select: { asset: { select: { userId: true } } },
    });
    const userIds = [...new Set(owners.map((o) => o.asset.userId))];

    let captured = 0;
    for (const userId of userIds) {
      try {
        const r = await capturePortfolioSnapshot(userId, now);
        if (r.captured) captured += 1;
      } catch (e) {
        logger.warn({ err: e, userId }, 'Snapshot capture failed for user.');
      }
    }
    return { users: userIds.length, captured };
  } finally {
    try {
      await client.$queryRaw`SELECT pg_advisory_unlock(hashtext(${ADVISORY_LOCK_KEY}))`;
    } catch {
      // Unlock best-effort; session-level lock releases on disconnect anyway.
    }
  }
}

export function startSnapshotJob(intervalMs = 5 * 60_000): NodeJS.Timeout {
  // Capture at job start when the bucket is still empty (first-write-wins).
  runSnapshotPass().catch((e) => logger.warn({ err: e }, 'Initial snapshot pass failed.'));
  const timer = setInterval(() => {
    runSnapshotPass().catch((e) => logger.warn({ err: e }, 'Scheduled snapshot pass failed.'));
  }, intervalMs);
  // Don't hold the process open for the timer alone in scripts/tests.
  if (typeof timer.unref === 'function') timer.unref();
  logger.info({ intervalMs }, 'Portfolio snapshot job started.');
  return timer;
}
