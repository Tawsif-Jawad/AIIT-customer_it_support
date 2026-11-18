import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('the lint toolchain matcher handles repeated single-branch extglobs within a bounded time', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const parser = createRequire(import.meta.resolve('@typescript-eslint/parser'));
    const estree = createRequire(parser.resolve('@typescript-eslint/typescript-estree'));
    const tinyglobby = createRequire(estree.resolve('tinyglobby'));
    const match = tinyglobby('picomatch');
    for (const pattern of ['+(*a)', '*(*a)', '+(*a*)', '+(*)/target']) {
      assert.equal(match(pattern)('a'.repeat(100) + 'x' + '/other'), false, pattern);
    }
    assert.equal(match('+(*a)')('a'.repeat(100) + 'x'), false);
    assert.equal(match('+(*a)')('ba'), true);
    assert.equal(match('**/*.{ts,tsx}')('apps/web/src/server.ts'), true);
    assert.equal(match('**/*.{ts,tsx}')('docs/README.md'), false);
  `], { timeout: 3000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
