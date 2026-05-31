import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/tokenizer.mjs';

test('lowercases and returns unique words in first-seen order', () => {
  assert.deepEqual(tokenize('Cat cat CAT dog Dog'), ['cat', 'dog']);
});

test('drops tokens shorter than minLength', () => {
  assert.deepEqual(tokenize('a an the cat', { minLength: 3 }), ['the', 'cat']);
  assert.deepEqual(tokenize('a an the cat', { minLength: 2 }), ['an', 'the', 'cat']);
});

test('ignores numbers and punctuation, keeps apostrophes and hyphens', () => {
  assert.deepEqual(
    tokenize("Well-known: don't, 1984! state-of-the-art."),
    ['well-known', "don't", 'state-of-the-art'],
  );
});

test('returns empty array for empty or non-string input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});
