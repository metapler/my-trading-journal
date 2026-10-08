import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startSnapshotJob } from './modules/portfolio/snapshotJob';

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
  // REDESIGN §9.2 — observed snapshots every 5 min in the host process.
  // Disabled in tests (vitest sets NODE_ENV=test) so suites stay deterministic.
  if (env.nodeEnv !== 'test') startSnapshotJob();
});
