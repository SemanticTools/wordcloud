import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDocumentFrequencies,
  computeIdf,
  trainCommonWords,
  buildIdfModel,
  loadIdfModel,
} from '../src/tfidf.mjs';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('computeDocumentFrequencies counts presence, not repeats', () => {
  const docs = [
    ['the', 'the', 'cat'],
    ['the', 'dog'],
  ];
  const df = computeDocumentFrequencies(docs);
  assert.equal(df.get('the'), 2);
  assert.equal(df.get('cat'), 1);
  assert.equal(df.get('dog'), 1);
});

test('computeIdf is zero for a word in every document, positive for rare ones', () => {
  const df = new Map([['the', 4], ['rare', 1]]);
  const idf = computeIdf(df, 4);
  assert.equal(idf.get('the'), 0); // ln(4/4)
  assert.ok(idf.get('rare') > 0); // ln(4/1)
});

test('trainCommonWords selects words above the document-frequency threshold', () => {
  const docs = [
    ['the', 'paris', 'france'],
    ['the', 'london', 'england'],
    ['the', 'berlin', 'germany'],
    ['the', 'madrid', 'spain'],
  ];
  const { words } = trainCommonWords(docs, { threshold: 0.5 });
  // "the" is in all 4 docs (100%); topic words appear once (25%).
  assert.deepEqual(words, ['the']);
});

test('trainCommonWords orders most-ubiquitous first and reports stats', () => {
  const docs = [
    ['alpha', 'beta', 'gamma'],
    ['alpha', 'beta', 'delta'],
    ['alpha', 'epsilon'],
  ];
  const { words, stats, documentCount } = trainCommonWords(docs, { threshold: 0.5 });
  assert.equal(documentCount, 3);
  // alpha in 3/3, beta in 2/3 -> both >= 0.5, alpha first.
  assert.deepEqual(words, ['alpha', 'beta']);
  assert.equal(stats[0].word, 'alpha');
  assert.equal(stats[0].df, 3);
  assert.ok(Math.abs(stats[0].fraction - 1) < 1e-9);
  assert.equal(typeof stats[0].idf, 'number');
  assert.equal(typeof stats[0].meanTfidf, 'number');
});

test('trainCommonWords handles an empty corpus', () => {
  const result = trainCommonWords([], { threshold: 0.3 });
  assert.deepEqual(result.words, []);
  assert.equal(result.documentCount, 0);
});

test('buildIdfModel produces per-word idf and a default for unseen words', () => {
  const docs = [
    ['the', 'paris'],
    ['the', 'london'],
    ['the', 'berlin'],
    ['the', 'madrid'],
  ];
  const model = buildIdfModel(docs);
  assert.equal(model.documentCount, 4);
  assert.equal(model.idf.the, 0); // ln(4/4)
  assert.ok(model.idf.paris > 0); // ln(4/1)
  assert.ok(Math.abs(model.defaultIdf - Math.log(4)) < 1e-9); // unseen treated as df=1
});

test('buildIdfModel handles an empty corpus', () => {
  const model = buildIdfModel([]);
  assert.deepEqual(model, { documentCount: 0, defaultIdf: 0, idf: {} });
});

test('loadIdfModel reads a model file and looks up idf with a default fallback', async () => {
  const path = join(tmpdir(), `idf-model-test-${process.pid}.json`);
  await writeFile(path, JSON.stringify({ documentCount: 10, defaultIdf: 2.3, idf: { paris: 1.5 } }));
  try {
    const model = await loadIdfModel(path);
    assert.equal(model.documentCount, 10);
    assert.equal(model.idfFor('paris'), 1.5);
    assert.equal(model.idfFor('unseen'), 2.3); // default
  } finally {
    await rm(path, { force: true });
  }
});

test('loadIdfModel returns null when the file is absent', async () => {
  const model = await loadIdfModel(join(tmpdir(), `nope-${process.pid}.json`));
  assert.equal(model, null);
});
