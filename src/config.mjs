// Loads and validates config.json, deep-merging it over sensible defaults so a
// partial (or missing) config file still yields a fully-populated config object.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

export const DEFAULT_CONFIG = {
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
  wikipedia: {
    apiUrl: 'https://en.wikipedia.org/w/api.php',
    userAgent: 'wordcloud-server/1.0 (https://example.com)',
    maxLookups: 50,
    concurrency: 8,
    timeoutMs: 10000,
    enabled: true,
  },
  model: 'wordcloud-1',
  minWordLength: 3,
  // Word-cap formula: cap = round(wordsPerPromptWord × X × uniquePromptWords),
  // where X is the verbosity multiplier. The multiplier path is clamped to
  // maxWordsHardLimit so "Full" on a long prompt can't blow up ("Max N" is exempt).
  wordsPerPromptWord: 10,
  maxWordsHardLimit: 1000,
  // Crawl depth for the (future) multi-hop harvest; also normalises distance.
  crawl: {
    maxDepth: 1,
  },
  maxRequestBytes: 1024 * 1024,
  training: {
    documentCount: 50,
    threshold: 0.3,
    outputPath: 'data/common-words.json',
    idfOutputPath: 'data/idf-model.json',
  },
};

// Recursively merge plain objects from `source` over `target`, returning a new
// object. Arrays and primitives in `source` replace those in `target`.
function deepMerge(target, source) {
  const out = { ...target };
  for (const [key, value] of Object.entries(source ?? {})) {
    if (isPlainObject(value) && isPlainObject(target?.[key])) {
      out[key] = deepMerge(target[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Read config.json (if present) and merge it over the defaults. A missing file
// is fine; a malformed one throws so the operator notices immediately.
export async function loadConfig(path = CONFIG_PATH) {
  let fileConfig = {};
  try {
    const raw = await readFile(path, 'utf8');
    fileConfig = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Failed to read config at ${path}: ${err.message}`);
    }
  }
  return deepMerge(DEFAULT_CONFIG, fileConfig);
}
