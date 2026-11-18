import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { proxyTokenHeader } from '../../packages/shared/src/ingress.ts';

export async function listenOnLoopback(server: net.Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return (server.address() as net.AddressInfo).port;
}

export function rehearsalCertificate(dir: string) {
  const caFile = path.join(dir, 'rehearsal-cert.pem');
  const keyFile = path.join(dir, 'rehearsal-key.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', keyFile, '-out', caFile,
  ], { stdio: 'ignore' });
  return { caFile, cert: readFileSync(caFile), key: readFileSync(keyFile), minVersion: 'TLSv1.2' as const };
}

export function createRehearsalEdge(certificate: ReturnType<typeof rehearsalCertificate>, token: string, target: () => number) {
  return https.createServer(certificate, (req, res) => {
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) =>
      name !== 'forwarded' && !name.startsWith('x-forwarded-') && name !== 'x-real-ip' && name !== proxyTokenHeader));
    headers['x-forwarded-for'] = req.socket.remoteAddress;
    headers[proxyTokenHeader] = token;
    const proxy = http.request({ host: '127.0.0.1', port: target(), path: req.url, method: req.method, headers }, reply => {
      res.writeHead(reply.statusCode ?? 502, { ...reply.headers, 'strict-transport-security': 'max-age=300' });
      reply.pipe(res);
    });
    proxy.setTimeout(5000, () => proxy.destroy());
    proxy.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(502).end();
    });
    req.pipe(proxy);
  });
}

/** A local single-recipient SMTP fixture. Successful messages are retained in memory and never relayed. */
export async function startRehearsalSink(certificate: ReturnType<typeof rehearsalCertificate>) {
  const received: { recipient: string; data: string }[] = [];
  const sockets = new Set<net.Socket>();
  let rejected = 0;
  let rejectNext = false;
  const server = tls.createServer(certificate, socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(5000, () => socket.destroy());
    socket.setEncoding('utf8');
    socket.write('220 localhost AIIT rehearsal\r\n');
    let pending = '';
    let data = '';
    let sending = false;
    let senderAccepted = false;
    let recipient = '';
    socket.on('data', (chunk: string) => {
      pending += chunk;
      if (pending.length + data.length > 65536) return socket.destroy();
      let boundary = pending.indexOf('\r\n');
      while (boundary >= 0) {
        const line = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf('\r\n');
        if (sending) {
          if (line !== '.') {
            data += line + '\r\n';
            continue;
          }
          if (rejectNext) {
            rejectNext = false;
            rejected++;
            socket.write('451 Synthetic sink temporarily unavailable\r\n');
          } else {
            received.push({ recipient, data });
            socket.write('250 Accepted into isolated sink\r\n');
          }
          sending = false;
          senderAccepted = false;
          recipient = '';
          data = '';
          continue;
        }
        if (/^(EHLO|HELO) /i.test(line)) socket.write('250 localhost\r\n');
        else if (/^MAIL FROM:<aiit-rehearsal@example\.test>$/i.test(line)) {
          senderAccepted = true;
          socket.write('250 Sender accepted\r\n');
        } else if (senderAccepted && !recipient && /^RCPT TO:<[a-z0-9][a-z0-9._+-]{0,63}@example\.test>$/i.test(line)) {
          recipient = line.slice(line.indexOf('<') + 1, -1);
          socket.write('250 Recipient accepted\r\n');
        } else if (line === 'DATA' && recipient) {
          sending = true;
          socket.write('354 End data with <CRLF>.<CRLF>\r\n');
        } else if (line === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('550 Rehearsal envelope or command rejected\r\n');
      }
    });
  });
  return {
    port: await listenOnLoopback(server),
    received,
    rejectNextMessage: () => { rejectNext = true; },
    rejectedCount: () => rejected,
    close: () => new Promise<void>(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}
