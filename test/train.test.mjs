import { test } from 'node:test';
import assert from 'node:assert/strict';
import { train } from '../src/train.mjs';

const config = { minWordLength: 3, wikipedia: {} };

// Fake title source + wiki client so no network is touched.
const fetchTitles = async (count) =>
  ['Alpha', 'Beta', 'Gamma', 'Delta'].slice(0, count);

const fakeWiki = {
  fetchArticles: async () => [
    { title: 'Alpha', extract: 'the program runs the program well' },
    { title: 'Beta', extract: 'the program reads files' },
    { title: 'Gamma', extract: 'the engine starts quickly' },
    { title: 'Delta', extract: 'the engine stops slowly' },
  ],
};

test('train downloads, runs tf-idf, and returns common words', async () => {
  const result = await train({
    count: 4,
    threshold: 0.5,
    config,
    wiki: fakeWiki,
    fetchTitles,
  });

  assert.equal(result.documentCount, 4);
  assert.equal(result.articleCount, 4);
  // "the" appears in all four docs -> selected. "program"/"engine" in 2/4 = 0.5.
  assert.ok(result.words.includes('the'));
  assert.ok(result.words.includes('program'));
  assert.ok(result.words.includes('engine'));
  // Topic-unique words (runs, reads, starts, stops) appear once -> excluded.
  assert.ok(!result.words.includes('runs'));
  assert.ok(!result.words.includes('quickly'));
  // Most ubiquitous first.
  assert.equal(result.words[0], 'the');
});

test('train respects a high threshold', async () => {
  const result = await train({
    count: 4,
    threshold: 0.9,
    config,
    wiki: fakeWiki,
    fetchTitles,
  });
  // Only "the" (100%) clears 90%.
  assert.deepEqual(result.words, ['the']);
});
