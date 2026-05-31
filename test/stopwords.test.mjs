import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeStopwords, STOPWORDS } from '../src/stopwords.mjs';

test('removes common stopwords, keeps content words', () => {
  const input = ['it', 'they', 'has', 'is', 'will', 'eiffel', 'tower', 'paris'];
  assert.deepEqual(removeStopwords(input), ['eiffel', 'tower', 'paris']);
});

test('returns an empty array when all words are stopwords', () => {
  assert.deepEqual(removeStopwords(['the', 'and', 'of', 'to']), []);
});

test('accepts a custom stopword set', () => {
  const custom = new Set(['banana']);
  assert.deepEqual(removeStopwords(['banana', 'apple'], custom), ['apple']);
});

test('the example words from the spec are all stopwords', () => {
  for (const word of ['it', 'they', 'has', 'is', 'will']) {
    assert.ok(STOPWORDS.has(word), `expected "${word}" to be a stopword`);
  }
});
