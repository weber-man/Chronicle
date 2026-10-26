import { createApp } from './app.js';
import { logError, logInfo, logWarn } from './http.js';

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT ?? 3001);
const { app, db, schemaVersion } = createApp();

logInfo('startup.server_initializing', {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  schemaVersion,
});

const server = app.listen(port, () => {
  logInfo('startup.server_listening', {
    port,
    url: `http://localhost:${port}`,
  });
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo('shutdown.started', { signal });

  const forceTimer = setTimeout(() => {
    logWarn('shutdown.forced', { signal, timeoutMs: 10_000 });
    server.closeAllConnections?.();
    try {
      db.close();
    } catch {
      // Already closed.
    }
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  server.close((error) => {
    clearTimeout(forceTimer);
    try {
      db.close();
      logInfo('shutdown.completed', { signal, databaseClosed: true });
    } catch (closeError) {
      logError('shutdown.database_close_failed', {
        message: closeError instanceof Error ? closeError.message : String(closeError),
      });
    }
    process.exit(error ? 1 : 0);
  });

  server.closeIdleConnections?.();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server.on('error', (error) => {
  logError('startup.server_failed', { message: error.message });
  process.exitCode = 1;
});
