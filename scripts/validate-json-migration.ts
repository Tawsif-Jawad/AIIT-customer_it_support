/** Read-only migration preflight. Never initializes a store or writes source data. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateDatabaseState, type DatabaseState } from '../apps/api/src/store.ts';
const file = process.argv[2];
if (!file || process.argv.length !== 3) throw new Error('Usage: node scripts/validate-json-migration.ts EXPLICIT_SOURCE_PATH');
const raw = fs.readFileSync(file);
const state = JSON.parse(raw.toString('utf8')) as DatabaseState;
validateDatabaseState(state);
const checksum = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest('hex');
console.log(JSON.stringify({mode:'READ_ONLY_DRY_RUN', validationVersion:2, sha256:crypto.createHash('sha256').update(raw).digest('hex'), counts:Object.fromEntries(Object.entries(state).map(([key,rows]) => [key,Array.isArray(rows) ? rows.length : null])), recordChecksums:Object.fromEntries(Object.entries(state).filter(([,rows])=>Array.isArray(rows)).map(([key,rows])=>[key,rows.map(checksum).sort()])), databaseConnected:false}));
