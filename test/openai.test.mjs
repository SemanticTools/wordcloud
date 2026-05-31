import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrompt,
  buildCompletion,
  buildError,
  buildModelList,
  RequestError,
} from '../src/openai.mjs';

test('parsePrompt extracts the textblock after the fixed prompt', () => {
  const messages = [{ role: 'user', content: 'Give me a wordcloud for: Hello world' }];
  const parsed = parsePrompt(messages);
  assert.equal(parsed.textblock, 'Hello world');
  assert.equal(parsed.verbosity, 'normal');
  assert.equal(parsed.maxN, null);
});

test('parsePrompt is case-insensitive and trims whitespace', () => {
  const messages = [{ role: 'user', content: 'GIVE ME A WORDCLOUD FOR:   spaced out  ' }];
  assert.equal(parsePrompt(messages).textblock, 'spaced out');
});

test('parsePrompt uses the latest user message', () => {
  const messages = [
    { role: 'user', content: 'Give me a wordcloud for: old' },
    { role: 'assistant', content: '[]' },
    { role: 'user', content: 'Give me a wordcloud for: new' },
  ];
  assert.equal(parsePrompt(messages).textblock, 'new');
});

test('parsePrompt recognises verbosity modifiers', () => {
  const p = (content) => parsePrompt([{ role: 'user', content }]);
  assert.deepEqual(p('Very brief, give me a wordcloud for: x'), { textblock: 'x', verbosity: 'brief', maxN: null });
  assert.deepEqual(p('Concisely, Give me a wordcloud for: x'), { textblock: 'x', verbosity: 'concise', maxN: null });
  assert.deepEqual(p('Verbosely, give me a wordcloud for: x'), { textblock: 'x', verbosity: 'verbose', maxN: null });
  assert.deepEqual(p('Full, give me a wordcloud for: x'), { textblock: 'x', verbosity: 'full', maxN: null });
  assert.deepEqual(p('Max 25, give me a wordcloud for: x'), { textblock: 'x', verbosity: 'max', maxN: 25 });
});

test('parsePrompt falls back to normal for an unrecognised modifier', () => {
  const parsed = parsePrompt([{ role: 'user', content: 'Gibberish, give me a wordcloud for: x' }]);
  assert.equal(parsed.verbosity, 'normal');
  assert.equal(parsed.textblock, 'x');
});

test('parsePrompt throws on malformed input', () => {
  assert.throws(() => parsePrompt([]), RequestError);
  assert.throws(() => parsePrompt([{ role: 'user', content: 'just chatting' }]), RequestError);
  assert.throws(
    () => parsePrompt([{ role: 'user', content: 'Give me a wordcloud for:   ' }]),
    RequestError,
  );
});

test('buildCompletion produces an OpenAI-shaped response with stringified payload', () => {
  const payload = { metadata: { returned: 1 }, data: [{ word: 'hello', distance: 0, score: 1, seed: true }] };
  const out = buildCompletion({
    model: 'wordcloud-1',
    payload,
    created: 1700000000,
    promptText: 'Hello world',
  });
  assert.equal(out.object, 'chat.completion');
  assert.equal(out.model, 'wordcloud-1');
  assert.equal(out.choices[0].finish_reason, 'stop');
  assert.equal(out.choices[0].message.role, 'assistant');
  assert.deepEqual(JSON.parse(out.choices[0].message.content), payload);
  assert.equal(typeof out.usage.total_tokens, 'number');
});

test('buildError produces an OpenAI-shaped error body', () => {
  const out = buildError('bad', { type: 'invalid_request_error', code: 'x' });
  assert.deepEqual(out, {
    error: { message: 'bad', type: 'invalid_request_error', code: 'x', param: null },
  });
});

test('buildModelList advertises the configured model', () => {
  const out = buildModelList('wordcloud-1', 1700000000);
  assert.equal(out.object, 'list');
  assert.equal(out.data[0].id, 'wordcloud-1');
});
