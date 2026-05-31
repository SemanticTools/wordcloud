import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWordcloud } from '../src/wordcloud.mjs';

const baseConfig = {
  minWordLength: 3,
  wordsPerPromptWord: 10,
  maxWordsHardLimit: 1000,
  crawl: { maxDepth: 1 },
  wikipedia: { enabled: true, maxLookups: 50 },
};

// A fake Wikipedia client: returns a canned article for known words only,
// and records which words were looked up.
function makeFakeWiki(articles) {
  const calls = [];
  return {
    calls,
    fetchArticles(words) {
      calls.push([...words]);
      return Promise.resolve(
        words
          .filter((w) => articles[w])
          .map((w) => ({ title: w, extract: articles[w] })),
      );
    },
  };
}

// Pull the plain word list out of the new { metadata, data } envelope.
const words = (result) => result.data.map((d) => d.word);

test('merges seed words with stopword-free article words, uniquely', async () => {
  const wiki = makeFakeWiki({
    paris: 'Paris is the capital city of France.',
    tower: 'The tower is a tall structure.',
  });
  const result = await generateWordcloud('Paris tower', { wiki, config: baseConfig });
  const w = words(result);

  assert.ok(w.includes('paris'));
  assert.ok(w.includes('tower'));
  assert.ok(w.includes('capital'));
  assert.ok(w.includes('city'));
  assert.ok(w.includes('france'));
  assert.ok(w.includes('tall'));
  assert.ok(w.includes('structure'));
  // Stopwords from articles removed.
  assert.ok(!w.includes('the'));
  assert.ok(!w.includes('is'));
  // Uniqueness.
  assert.equal(w.length, new Set(w).size);
});

test('seed words carry distance 0 and the seed flag; article words distance 1', async () => {
  const wiki = makeFakeWiki({ paris: 'Paris is the capital city of France.' });
  const result = await generateWordcloud('Paris', { wiki, config: baseConfig });
  const paris = result.data.find((d) => d.word === 'paris');
  const capital = result.data.find((d) => d.word === 'capital');
  assert.equal(paris.seed, true);
  assert.equal(paris.distance, 0);
  assert.equal(capital.seed, false);
  assert.equal(capital.distance, 1); // hop 1 / maxDepth 1
});

test('data is sorted by score descending', async () => {
  const wiki = makeFakeWiki({ quantum: 'energy energy energy quirk' });
  const result = await generateWordcloud('quantum', { wiki, config: baseConfig });
  const scores = result.data.map((d) => d.score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i - 1] >= scores[i], 'scores should be non-increasing');
  }
  // "energy" (freq 3) outranks "quirk" (freq 1).
  const w = words(result);
  assert.ok(w.indexOf('energy') < w.indexOf('quirk'));
});

test('uses an injected idf model to weight the score', async () => {
  const wiki = makeFakeWiki({ quantum: 'rareword rareword common common common' });
  // "rareword" is highly distinctive (idf 5); "common" is generic (idf 0.1).
  const idfModel = {
    defaultIdf: 4,
    idf: new Map([['rareword', 5], ['common', 0.1], ['quantum', 1]]),
    idfFor(word) {
      return this.idf.has(word) ? this.idf.get(word) : this.defaultIdf;
    },
  };
  const result = await generateWordcloud('quantum', { wiki, config: baseConfig, idfModel });
  const w = words(result);
  // Despite appearing fewer times, "rareword" (2×5=10) beats "common" (3×0.1=0.3).
  assert.ok(w.indexOf('rareword') < w.indexOf('common'));
});

test('drops stopwords from the seed text', async () => {
  const wiki = makeFakeWiki({});
  const result = await generateWordcloud('it they has is will cat', { wiki, config: baseConfig });
  assert.deepEqual(words(result), ['cat']);
});

test('respects maxLookups cap', async () => {
  const wiki = makeFakeWiki({});
  const config = { ...baseConfig, wikipedia: { enabled: true, maxLookups: 2 } };
  await generateWordcloud('alpha bravo charlie delta', { wiki, config });
  assert.deepEqual(wiki.calls[0], ['alpha', 'bravo']);
});

test('returns only seed words when wikipedia is disabled', async () => {
  const wiki = makeFakeWiki({ paris: 'Paris is the capital.' });
  const config = { ...baseConfig, wikipedia: { enabled: false } };
  const result = await generateWordcloud('Paris tower', { wiki, config });
  assert.deepEqual(words(result).sort(), ['paris', 'tower']);
  assert.equal(wiki.calls.length, 0);
  assert.equal(result.metadata.articlesRequested, 0);
});

test('returns an empty cloud for text with no meaningful words', async () => {
  const wiki = makeFakeWiki({});
  const result = await generateWordcloud('the and of to', { wiki, config: baseConfig });
  assert.deepEqual(result.data, []);
});

test('metadata reports the verbosity, multiplier, cap and counts', async () => {
  const wiki = makeFakeWiki({ paris: 'the capital and city are france europe nation republic' });
  const result = await generateWordcloud('Paris', { wiki, config: baseConfig, verbosity: 'normal' });
  const m = result.metadata;
  assert.equal(m.input, 'Paris');
  assert.equal(m.verbosity, 'normal');
  assert.equal(m.multiplier, 1);
  assert.equal(m.uniquePromptWords, 1);
  assert.equal(m.cap, 10); // 10 × 1 × 1
  assert.equal(m.seedWords, 1);
  assert.equal(m.articlesRequested, 1);
  assert.equal(m.articlesFound, 1);
  assert.equal(m.returned, result.data.length);
  assert.ok(m.commonWordsPruned >= 1); // "of" was pruned
  assert.equal(typeof m.elapsedMs, 'number');
});

test('cap scales with verbosity multiplier', async () => {
  // 30 distinct article words so the cap, not supply, is the binding constraint.
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const filler = Array.from({ length: 60 }, (_, i) =>
    `zz${letters[Math.floor(i / 26)]}${letters[i % 26]}`).join(' ');
  const wiki = makeFakeWiki({ paris: filler });

  const brief = await generateWordcloud('Paris', { wiki, config: baseConfig, verbosity: 'brief' });
  // cap = round(10 × 0.25 × 1) = 3 (total cloud size).
  assert.equal(brief.metadata.cap, 3);
  assert.equal(brief.data.length, 3);

  const normal = await generateWordcloud('Paris', { wiki, config: baseConfig, verbosity: 'normal' });
  assert.equal(normal.metadata.cap, 10);
  assert.equal(normal.data.length, 10);
});

test('"Max N" is an absolute cap', async () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const filler = Array.from({ length: 60 }, (_, i) =>
    `zz${letters[Math.floor(i / 26)]}${letters[i % 26]}`).join(' ');
  const wiki = makeFakeWiki({ paris: filler });
  const result = await generateWordcloud('Paris', { wiki, config: baseConfig, verbosity: 'max', maxN: 5 });
  assert.equal(result.metadata.cap, 5);
  assert.equal(result.data.length, 5);
});

test('seed words are always kept even when they overflow a tiny cap', async () => {
  const wiki = makeFakeWiki({});
  // Five seed words but a hard cap of 2 -> all five seeds still returned.
  const result = await generateWordcloud('alpha bravo charlie delta echo', {
    wiki, config: baseConfig, verbosity: 'max', maxN: 2,
  });
  const w = words(result);
  assert.equal(w.length, 5);
  assert.ok(['alpha', 'bravo', 'charlie', 'delta', 'echo'].every((s) => w.includes(s)));
});

test('uniquePromptWords counts raw tokens, including stopwords', async () => {
  const wiki = makeFakeWiki({});
  const config = { ...baseConfig, wikipedia: { enabled: false } };
  const result = await generateWordcloud('What is physics', { wiki, config });
  assert.equal(result.metadata.uniquePromptWords, 3); // what / is / physics
});
