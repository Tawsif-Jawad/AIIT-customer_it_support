import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { EmailMessagePayload, EmailTransportAdapter } from '../../../packages/connectors/src/index.ts';

type RehearsalTransport = Pick<EmailTransportAdapter, 'providerName' | 'sendEmail'>;
type SmtpClient = {
  sendMail(message: {
    from: string;
    to: string;
    envelope: { from: string; to: string[] };
    subject: string;
    text: string;
    messageId: string;
  }): Promise<{ accepted: string[]; rejected: string[] }>;
};

const sender = 'aiit-rehearsal@example.test';
const syntheticAddress = /^[a-z0-9][a-z0-9._+-]{0,63}@example\.test$/i;
const require = createRequire(import.meta.url);

export function createRehearsalSmtp(env = process.env): RehearsalTransport | undefined {
  if (env.AIIT_REHEARSAL_SMTP_PORT === undefined) return undefined;
  const port = Number(env.AIIT_REHEARSAL_SMTP_PORT);
  const caFile = env.AIIT_REHEARSAL_SMTP_CA;
  const db = URL.parse(env.DATABASE_URL ?? '');
  if (env.NODE_ENV !== 'test' || env.STORAGE_MODE !== 'postgres' ||
      db?.protocol !== 'postgresql:' || db.hostname !== '127.0.0.1' || db.pathname !== '/aiit_test' ||
      db.username !== 'aiit_test' || db.password || !db.port || db.hash ||
      [...db.searchParams.keys()].some(key => key !== 'connect_timeout') ||
      !Number.isInteger(port) || port < 1024 || port > 65535 || !caFile) {
    throw new Error('REHEARSAL_SMTP_UNSAFE_CONFIG');
  }

  const nodemailer = require('nodemailer') as { createTransport(options: object): SmtpClient };
  const client = nodemailer.createTransport({
    host: '127.0.0.1', port, secure: true, name: 'localhost',
    tls: { ca: readFileSync(caFile), servername: 'localhost', minVersion: 'TLSv1.2', rejectUnauthorized: true },
    disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1,
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
  });
  const providerName = 'rehearsal-loopback-smtp';
  return {
    providerName,
    async sendEmail(message: EmailMessagePayload) {
      const failed = { delivered: false, messageId: '', transport: providerName };
      if (!syntheticAddress.test(message.to) || !message.deliveryId || !/^[\w-]{1,128}$/.test(message.deliveryId)) {
        return { ...failed, error: 'REHEARSAL_RECIPIENT_OR_DELIVERY_ID_REJECTED' };
      }
      const messageId = '<' + message.deliveryId + '@example.test>';
      try {
        const info = await client.sendMail({
          from: sender, to: message.to, envelope: { from: sender, to: [message.to] },
          subject: message.subject, text: message.textBody, messageId,
        });
        if (info.accepted.length === 1 && info.accepted[0] === message.to && info.rejected.length === 0) {
          return { delivered: true, messageId, transport: providerName };
        }
      } catch {
        // Do not surface SMTP responses, body, envelope, or certificate paths.
      }
      return { ...failed, error: 'REHEARSAL_SMTP_DELIVERY_FAILED' };
    },
  };
}
