import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
const require = createRequire(import.meta.url);

test('security backport is the actual resolver for dev toolchain and preserves provenance', () => {
  const cfg = JSON.parse(readFileSync('vendor/picomatch-v4/package.json', 'utf8'));
  assert.equal(cfg.name, '@fmtech/picomatch-backport');
  assert.equal(cfg.version, '4.0.8-iron.0');
  assert.equal(cfg.ironUpstreamSha, 'c63a5bf4e61dbdb81bc41e97dc2616c30acce337');
  const expected = realpathSync('vendor/picomatch-v4/index.js');
  for (const packageName of ['vitest', 'vite', 'micromatch', 'tinyglobby']) {
    const resolved = require.resolve('picomatch', { paths: [require.resolve(packageName + '/package.json')] });
    assert.equal(realpathSync(resolved), expected, packageName + ' resolved unpatched glob matcher');
  }
});

test('CVE-2026-112366 repeated extglob cannot cause catastrophic backtracking', () => {
  const code = `
    const assert=require('node:assert/strict');
    const matcher=require('./vendor/picomatch-v4');
    const patterns=['+(*a)','+(*a)c','*(a*)b','+(a*b)c'];
    for(const pattern of patterns) assert.equal(matcher.isMatch('a'.repeat(10000)+'!', pattern),false,pattern);
    for(const [pattern, yes, no] of [
      ['+(*a)', 'aba', 'bbb'],
      ['+(a*b)', 'abab', 'abc'],
      ['*(a*b)c', 'ababc', 'abb'],
      ['x+(*a)y', 'xabaay', 'xby'],
    ]) {
      assert.equal(matcher.isMatch(yes,pattern), true, pattern);
      assert.equal(matcher.isMatch(no,pattern), false, pattern);
    }
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['-e', code], {
    timeout: 2500, stdio: ['ignore','pipe','pipe'],
  }));
});
