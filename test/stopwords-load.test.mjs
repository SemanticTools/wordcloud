import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCommonWords, buildStopwordSet, STOPWORDS } from '../src/stopwords.mjs';

test('loadCommonWords returns [] when the file is missing', async () => {
  const words = await loadCommonWords(join(tmpdir(), 'definitely-not-here-12345.json'));
  assert.deepEqual(words, []);
});

test('loadCommonWords reads the { words } object form', async () => {
  const path = join(tmpdir(), `cw-object-${process.pid}.json`);
  await writeFile(path, JSON.stringify({ words: ['foo', 'bar', 42, null] }));
  try {
    assert.deepEqual(await loadCommonWords(path), ['foo', 'bar']);
  } finally {
    await rm(path, { force: true });
  }
});

test('loadCommonWords reads the bare-array form', async () => {
  const path = join(tmpdir(), `cw-array-${process.pid}.json`);
  await writeFile(path, JSON.stringify(['foo', 'bar']));
  try {
    assert.deepEqual(await loadCommonWords(path), ['foo', 'bar']);
  } finally {
    await rm(path, { force: true });
  }
});

test('buildStopwordSet unions the baseline with trained words', async () => {
  const path = join(tmpdir(), `cw-union-${process.pid}.json`);
  await writeFile(path, JSON.stringify({ words: ['supercalifragilistic'] }));
  try {
    const set = await buildStopwordSet(path);
    assert.ok(set.has('supercalifragilistic')); // trained
    assert.ok(set.has('the')); // baseline preserved
    assert.equal(set.size, STOPWORDS.size + 1);
  } finally {
    await rm(path, { force: true });
  }
});
