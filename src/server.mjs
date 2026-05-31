// HTTP server: an OpenAI-compatible chat-completions endpoint backed by the
// wordcloud pipeline, plus static hosting of the browser UI in src-static/.

import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import {
  parsePrompt,
  buildCompletion,
  buildError,
  buildModelList,
  RequestError,
} from './openai.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'src-static');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Read the full request body as a string, rejecting anything over `maxBytes`.
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new RequestError('Request body too large.', { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Serve a file from src-static/, guarding against path traversal.
async function serveStatic(res, urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(STATIC_DIR, rel === '/' ? 'index.html' : rel);

  if (!filePath.startsWith(STATIC_DIR)) {
    sendJson(res, 403, buildError('Forbidden.', { type: 'forbidden' }));
    return;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext];
  if (!mime) {
    sendJson(res, 404, buildError('Not found.', { type: 'not_found' }));
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
    res.end(data);
  } catch {
    sendJson(res, 404, buildError('Not found.', { type: 'not_found' }));
  }
}

// Handle POST /v1/chat/completions.
async function handleChatCompletion(req, res, { config, generate, now }) {
  const raw = await readBody(req, config.maxRequestBytes ?? 1024 * 1024);
  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    throw new RequestError('Request body must be valid JSON.');
  }

  const { textblock, verbosity, maxN } = parsePrompt(body.messages);
  const payload = await generate(textblock, { verbosity, maxN });
  const model = body.model || config.model;
  const created = Math.floor(now() / 1000);
  sendJson(res, 200, buildCompletion({ model, payload, created, promptText: textblock }));
}

// Build the HTTP server. Dependencies are injected so the handler logic can be
// tested without real config/network:
//   - config:   merged config object
//   - generate: async (textblock, { verbosity, maxN }) => { metadata, data }
//   - now:      () => epoch ms                   (injectable clock)
export function createServer({ config, generate, now = () => Date.now() }) {
  return createHttpServer(async (req, res) => {
    const { method } = req;
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    try {
      if (method === 'GET' && path === '/healthz') {
        sendJson(res, 200, { status: 'ok' });
        return;
      }
      if (method === 'GET' && path === '/v1/models') {
        sendJson(res, 200, buildModelList(config.model, Math.floor(now() / 1000)));
        return;
      }
      if (method === 'POST' && path === '/v1/chat/completions') {
        await handleChatCompletion(req, res, { config, generate, now });
        return;
      }
      if (method === 'GET' || method === 'HEAD') {
        await serveStatic(res, path);
        return;
      }
      sendJson(res, 404, buildError('Not found.', { type: 'not_found' }));
    } catch (err) {
      if (err instanceof RequestError) {
        sendJson(res, err.status, buildError(err.message, { type: err.type, code: err.code }));
      } else {
        console.error('[server] unexpected error:', err);
        sendJson(res, 500, buildError('Internal server error.', { type: 'server_error' }));
      }
    }
  });
}
