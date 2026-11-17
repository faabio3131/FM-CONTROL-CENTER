import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('CVE-2026-112366: source-pinned v2/v4 patch rejects hostile repeated-extglob input without backtracking', () => {
  const child = String.raw`
    const assert = require('node:assert/strict');
    for (const location of ['./vendor/picomatch-v2', './vendor/picomatch-v4']) {
      const picomatch = require(location);
      assert.equal(picomatch.isMatch('readme.txt','*.txt'),true);
      assert.equal(picomatch.isMatch('readme.js','*.txt'),false);
      const attack = 'a'.repeat(10000)+'!';
      for (const glob of ['+(*a)', '*(*a)', '+(*a)c', 'x+(*a)']) {
        assert.equal(picomatch.isMatch(attack,glob),false);
      }
    }
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['-e', child], {
    timeout: 3500, stdio: ['ignore', 'pipe', 'pipe'],
  }));
});

test('local security patches preserve upstream provenance and are not mislabeled as published releases', async () => {
  const fs = await import('node:fs');
  const v2 = JSON.parse(fs.readFileSync('vendor/picomatch-v2/package.json', 'utf8'));
  const v4 = JSON.parse(fs.readFileSync('vendor/picomatch-v4/package.json', 'utf8'));
  assert.equal(v2.ironUpstreamSha, 'f03bec2c02e46f063fbfdc161aae1d0f854b2565');
  assert.equal(v4.ironUpstreamSha, 'c63a5bf4e61dbdb81bc41e97dc2616c30acce337');
  assert.match(v2.version, /-iron\./);
  assert.match(v4.version, /-iron\./);
});
