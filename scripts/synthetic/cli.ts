import { createInterface } from 'node:readline';
import { startOffice } from './office.ts';
import { runOfficeScenarios } from './scenarios.ts';

const command = process.argv[2];
if (command !== 'up' && command !== 'demo') throw new Error('Use synthetic:up or synthetic:demo');
if (command === 'demo') {
  const office = await startOffice();
  try {
    console.log(JSON.stringify({ inventory: office.counts, postgres: office.version, ...await runOfficeScenarios(office) }, null, 2));
  } finally { await office.close(); }
} else {
  const port = 3120;
  let office = await startOffice(port, true);
  console.log('SYNTHETIC ENVIRONMENT — FICTIONAL DATA');
  console.log(office.publicUrl + '/app');
  console.log('Commands: status, inbox, fail-mail, reset, down');
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const stop = () => input.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    for await (const line of input) {
      switch (line.trim()) {
        case 'status': console.log(JSON.stringify({ portal: office.publicUrl + '/app', seeded: office.counts, mail: office.sink.received.length })); break;
        case 'inbox': console.log(JSON.stringify(office.sink.received.slice(-20), null, 2)); break;
        case 'fail-mail': office.sink.rejectNextMessage(); console.log('Next SMTP DATA will be rejected with a temporary failure.'); break;
        case 'reset':
          await office.close();
          office = await startOffice(port, true);
          console.log('Created a fresh disposable office. Sign in again.');
          break;
        case 'down': input.close(); break;
        default: console.log('Commands: status, inbox, fail-mail, reset, down');
      }
    }
  } finally { await office.close(); }
}
