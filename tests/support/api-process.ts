import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

export async function startApiProcess(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ['apps/api/src/main.ts'], {
    env: { ...process.env, ...env, API_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  const exited = once(child, 'exit');
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  };
  try {
    for (let i = 0; i < 200 && child.exitCode === null; i++) {
      const line = output.split('\n').find(entry => entry.includes('SERVER_LISTENING'));
      if (line) {
        const { port, storageMode } = JSON.parse(line);
        if (storageMode !== 'postgres' || !Number.isInteger(port)) throw new Error('Unexpected API fixture mode');
        return { url: 'http://127.0.0.1:' + port, pid: child.pid!, close };
      }
      await delay(25);
    }
    throw new Error('Disposable PostgreSQL API process did not start');
  } catch (error) {
    await close();
    throw error;
  }
}
