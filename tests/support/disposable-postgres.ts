import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { createInitialSeedState } from '../../apps/api/src/store.ts';

export function postgresBinaries() {
  try {
    const dir = process.env.PG_BINDIR || path.dirname(execFileSync('which', ['initdb'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    return fs.existsSync(path.join(dir, 'initdb')) ? dir : undefined;
  } catch { return undefined; }
}

export async function disposablePostgres() {
  const bindir = postgresBinaries();
  if (!bindir) throw new Error('Disposable PostgreSQL binaries required');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiit-day5-'));
  const data = path.join(dir, 'pg');
  const listener = net.createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const pg = (command: string, args: string[]) => execFileSync(path.join(bindir, command), args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let running = false;
  const start = () => {
    pg('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${dir}`, '-w', 'start']);
    running = true;
  };
  const stop = () => {
    if (!running) return;
    pg('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    running = false;
  };
  const close = () => {
    stop();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  const url = `postgresql://aiit_test@127.0.0.1:${port}/aiit_test?connect_timeout=2`;
  try {
    pg('initdb', ['-D', data, '-U', 'aiit_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    start();
    pg('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'aiit_test', 'aiit_test']);
    execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], {
      env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe',
    });
    return { url, dir, start, stop, close, version: pg('postgres', ['--version']).trim() };
  } catch (error) {
    close();
    throw error;
  }
}

export const fixtureIdentities = [
  { email: 'employee@example.test', name: 'Synthetic Employee' },
  { email: 'second-employee@example.test', name: 'Synthetic Other Employee' },
  { email: 'customer@example.test', name: 'Synthetic Customer' },
  { email: 'it@example.test', name: 'Synthetic IT Administrator' },
  { email: 'cto@example.test', name: 'Synthetic CTO' },
];

export function runtimeFixture() {
  const source = createInitialSeedState();
  let serialized = JSON.stringify(source);
  source.users.forEach((user, index) => {
    serialized = serialized.replaceAll(user.email, fixtureIdentities[index].email)
      .replaceAll(user.displayName, fixtureIdentities[index].name);
  });
  return JSON.parse(serialized) as typeof source;
}
