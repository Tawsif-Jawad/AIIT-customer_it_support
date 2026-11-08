/**
 * Background Worker Service (apps/worker)
 * Processes queued email/in-app notifications and executes policy-governed SLA checks.
 */
import { DevelopmentEmailTransport } from '../../../packages/connectors/src/index.ts';
import { EnterpriseDataStore } from '../../api/src/store.ts';
import { NotificationQueueProcessor } from '../../api/src/queue.ts';

const store = new EnterpriseDataStore();
const emailTransport = new DevelopmentEmailTransport({
  mode: (process.env.MAIL_PROVIDER as 'mock' | 'mailpit') || 'mock',
  smtpHost: process.env.SMTP_HOST || 'localhost',
  smtpPort: Number(process.env.SMTP_PORT || 1025),
  fromAddress: process.env.MAIL_FROM_ADDRESS || 'noreply-itsupport@local.dev.invalid',
});
const processor = new NotificationQueueProcessor(store, emailTransport);

async function runWorkerCycle() {
  const result = await processor.processPendingJobs();
  if (result.processedCount > 0) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'it-support-worker',
        event: 'NOTIFICATION_BATCH_PROCESSED',
        ...result,
      })
    );
  }
}

console.log(
  JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'it-support-worker',
    event: 'WORKER_STARTED',
    transport: emailTransport.providerName,
  })
);

runWorkerCycle();

if (!process.argv.includes('--once')) {
  setInterval(runWorkerCycle, 5000);
}
