const db = require('./db');
const k8sManager = require('./k8s-manager');

async function cleanupExpiredSessions() {
  try {
    console.log('[Cleanup] Checking for expired sessions...');
    const expiredSessions = await db.getExpiredSessions();

    if (expiredSessions.length === 0) {
      console.log('[Cleanup] No expired sessions found.');
      return;
    }

    console.log(`[Cleanup] Found ${expiredSessions.length} expired session(s).`);

    for (const session of expiredSessions) {
      try {
        console.log(`[Cleanup] Cleaning up namespace: ${session.namespace}`);
        await k8sManager.cleanupNamespace(session.namespace);
        await db.deactivateSession(session.session_id);
        console.log(`[Cleanup] Session ${session.session_id} cleaned up.`);
      } catch (err) {
        console.error(`[Cleanup] Error cleaning session ${session.session_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error during cleanup:', err.message);
  }
}

function startCleanupJob(intervalMinutes = 5) {
  console.log(`[Cleanup] Starting cleanup job (runs every ${intervalMinutes} minutes)`);

  // Run immediately on startup
  cleanupExpiredSessions();

  // Then run periodically with error protection
  setInterval(() => {
    cleanupExpiredSessions().catch((err) => {
      console.error('[Cleanup] Unhandled error in cleanup job:', err.message);
    });
  }, intervalMinutes * 60 * 1000);
}

module.exports = {
  cleanupExpiredSessions,
  startCleanupJob
};

// If run directly: node cleanup.js
if (require.main === module) {
  db.init().then(() => {
    console.log('[Cleanup] Database initialized.');
    return cleanupExpiredSessions();
  }).then(() => {
    console.log('[Cleanup] Manual cleanup complete.');
    return db.close();
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('[Cleanup] Fatal error:', err);
    process.exit(1);
  });
}
