import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';

const config = {
  model: 'wordcloud-1',
  maxRequestBytes: 1024 * 1024,
  wikipedia: { enabled: true },
};

// Deterministic clock + stub pipeline so the server is tested without network.
// The stub echoes the textblock words and the parsed verbosity so we can assert
// both the envelope shape and that the modifier was threaded through.
const now = () => 1700000000000;
const generate = async (textblock, { verbosity = 'normal', maxN = null } = {}) => {
  const words = textblock.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    metadata: { input: textblock, verbosity, maxN, returned: words.length },
    data: words.map((word) => ({ word, distance: 0, score: 1, seed: true })),
  };
};

let server;
let baseUrl;

before(async () => {
  server = createServer({ config, generate, now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /healthz returns ok', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /v1/models lists the configured model', async () => {
  const res = await fetch(`${baseUrl}/v1/models`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.data[0].id, 'wordcloud-1');
});

test('POST /v1/chat/completions returns a stringified { metadata, data } envelope', async () => {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Give me a wordcloud for: Hello World' }],
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.object, 'chat.completion');
  const payload = JSON.parse(data.choices[0].message.content);
  assert.deepEqual(payload.data.map((d) => d.word), ['hello', 'world']);
  assert.equal(payload.metadata.verbosity, 'normal');
});

test('POST threads the verbosity modifier through to the pipeline', async () => {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Max 7, Give me a wordcloud for: Hello World' }],
    }),
  });
  assert.equal(res.status, 200);
  const payload = JSON.parse((await res.json()).choices[0].message.content);
  assert.equal(payload.metadata.verbosity, 'max');
  assert.equal(payload.metadata.maxN, 7);
});

test('POST with a malformed prompt returns a 400 OpenAI error', async () => {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi there' }] }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.type, 'invalid_request_error');
});

test('POST with invalid JSON returns a 400 error', async () => {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
});

test('GET / serves the UI', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Wordcloud Server/);
});

test('unknown GET path returns 404', async () => {
  const res = await fetch(`${baseUrl}/does-not-exist.txt`);
  assert.equal(res.status, 404);
});
