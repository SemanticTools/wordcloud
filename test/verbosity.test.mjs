import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModifier, computeCap, multiplierFor } from '../src/verbosity.mjs';

test('parseModifier maps recognised phrases (case-insensitive)', () => {
  assert.deepEqual(parseModifier(''), { verbosity: 'normal', maxN: null });
  assert.deepEqual(parseModifier('very brief'), { verbosity: 'brief', maxN: null });
  assert.deepEqual(parseModifier('VERY BRIEF'), { verbosity: 'brief', maxN: null });
  assert.deepEqual(parseModifier('Concisely'), { verbosity: 'concise', maxN: null });
  assert.deepEqual(parseModifier('Verbosely'), { verbosity: 'verbose', maxN: null });
  assert.deepEqual(parseModifier('Full'), { verbosity: 'full', maxN: null });
  assert.deepEqual(parseModifier('Max 42'), { verbosity: 'max', maxN: 42 });
});

test('parseModifier returns null for an unrecognised phrase', () => {
  assert.equal(parseModifier('whatever'), null);
});

const config = { wordsPerPromptWord: 10, maxWordsHardLimit: 1000 };

test('computeCap multiplies normal × X × uniquePromptWords', () => {
  // The README example: "What is physics." -> unique 3, normal 10, X 1 -> 30.
  assert.equal(computeCap({ verbosity: 'normal', uniquePromptWords: 3, config }), 30);
  assert.equal(computeCap({ verbosity: 'brief', uniquePromptWords: 4, config }), 10); // round(10×.25×4)
  assert.equal(computeCap({ verbosity: 'concise', uniquePromptWords: 4, config }), 20);
  assert.equal(computeCap({ verbosity: 'verbose', uniquePromptWords: 4, config }), 80);
  assert.equal(computeCap({ verbosity: 'full', uniquePromptWords: 4, config }), 400);
});

test('computeCap clamps the multiplier path to maxWordsHardLimit', () => {
  // Full × a long prompt would be 10 × 10 × 40 = 4000, clamped to 1000.
  assert.equal(computeCap({ verbosity: 'full', uniquePromptWords: 40, config }), 1000);
});

test('computeCap honours "Max N" absolutely, ignoring the ceiling', () => {
  assert.equal(computeCap({ verbosity: 'max', maxN: 5, uniquePromptWords: 100, config }), 5);
  assert.equal(computeCap({ verbosity: 'max', maxN: 5000, uniquePromptWords: 1, config }), 5000);
});

test('multiplierFor reports the numeric multiplier', () => {
  assert.equal(multiplierFor('brief'), 0.25);
  assert.equal(multiplierFor('normal'), 1);
  assert.equal(multiplierFor('max', 12), 12);
});
