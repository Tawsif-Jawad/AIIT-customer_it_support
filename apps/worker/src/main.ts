/** JSON mode has one transaction owner: the API. No standalone snapshot writer.
 * Durable database-backed workers remain a migration prerequisite. */
console.error('WORKER_DISABLED_JSON_MODE: Notifications are processed by the API. Standalone workers require the transactional database repository.');
process.exitCode = 1;
