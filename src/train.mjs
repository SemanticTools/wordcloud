// Trainer: learn a "common words" stopword list from real Wikipedia text.
//
// It downloads a sample of random Wikipedia articles, runs TF-IDF over them,
// and writes the words that appear in a large fraction of documents (i.e. low
// IDF — generic, uninformative words) to data/common-words.json. The server
// loads that file and folds it into its stopword set.
//
// Run directly:  node src/train.mjs [--count 50] [--threshold 0.3] [--out path]

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { createWikipediaClient } from './wikipedia.mjs';
import { tokenizeAll } from './tokenizer.mjs';
import { trainCommonWords, buildIdfModel } from './tfidf.mjs';

// Fetch `count` random main-namespace article titles from the MediaWiki API.
export async function fetchRandomTitles(count, config) {
  const { apiUrl, userAgent, timeoutMs } = config.wikipedia;
  const params = new URLSearchParams({
    action: 'query',
    list: 'random',
    rnnamespace: '0', // main (article) namespace only
    rnlimit: String(count),
    format: 'json',
    formatversion: '2',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}?${params}`, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.query?.random ?? []).map((r) => r.title);
  } finally {
    clearTimeout(timer);
  }
}

// Run the full training pipeline. Dependencies (`wiki`, `fetchTitles`, `log`)
// are injectable so this is testable without the network.
export async function train({
  count = 50,
  threshold = 0.3,
  config,
  wiki,
  fetchTitles = fetchRandomTitles,
  log = () => {},
}) {
  log(`Fetching ${count} random Wikipedia article titles...`);
  const titles = await fetchTitles(count, config);

  log(`Downloading ${titles.length} articles...`);
  const articles = await wiki.fetchArticles(titles);
  log(`Downloaded ${articles.length} articles with usable content.`);

  const minLength = config.minWordLength ?? 3;
  const documents = articles.map((a) => tokenizeAll(a.extract, { minLength }));

  const result = trainCommonWords(documents, { threshold });
  // Also build the per-word IDF model used for request-time tf-idf scoring (T2).
  const idfModel = buildIdfModel(documents);
  return { ...result, idfModel, requestedCount: count, articleCount: articles.length };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--count' || arg === '-n') out.count = Number(argv[++i]);
    else if (arg === '--threshold' || arg === '-t') out.threshold = Number(argv[++i]);
    else if (arg === '--out' || arg === '-o') out.out = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`Train the common-words stopword list from random Wikipedia articles.

Usage: node src/train.mjs [options]

Options:
  -n, --count <n>        Number of random articles to sample (default: config.training.documentCount)
  -t, --threshold <f>    Document-frequency fraction above which a word is "common" (0-1)
  -o, --out <path>       Output JSON path (default: config.training.outputPath)
  -h, --help             Show this help
`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const config = await loadConfig();
  const training = config.training ?? {};
  const count = cli.count ?? training.documentCount ?? 50;
  const threshold = cli.threshold ?? training.threshold ?? 0.3;
  const outPath = resolve(cli.out ?? training.outputPath ?? 'data/common-words.json');
  const idfPath = resolve(training.idfOutputPath ?? 'data/idf-model.json');

  if (!Number.isFinite(count) || count < 1) throw new Error(`Invalid --count: ${count}`);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`Invalid --threshold (must be in 0..1): ${threshold}`);
  }

  const wiki = createWikipediaClient(config.wikipedia);
  const result = await train({ count, threshold, config, wiki, log: console.log });

  if (result.documentCount === 0) {
    throw new Error('No articles were downloaded; cannot train. Check connectivity.');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    requestedCount: result.requestedCount,
    documentCount: result.documentCount,
    threshold,
    minWordLength: config.minWordLength ?? 3,
    wordCount: result.words.length,
    words: result.words,
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);

  // Write the IDF model used for request-time tf-idf scoring (T2).
  const idfPayload = {
    generatedAt: new Date().toISOString(),
    documentCount: result.idfModel.documentCount,
    defaultIdf: result.idfModel.defaultIdf,
    idf: result.idfModel.idf,
  };
  await mkdir(dirname(idfPath), { recursive: true });
  await writeFile(idfPath, `${JSON.stringify(idfPayload, null, 2)}\n`);

  console.log(`\nSelected ${result.words.length} common words from ${result.documentCount} articles (threshold ${threshold}).`);
  console.log(`Top 30: ${result.words.slice(0, 30).join(', ')}`);
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${idfPath} (IDF model: ${Object.keys(result.idfModel.idf).length} terms).`);
}

// Only run main() when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Training failed:', err.message);
    process.exit(1);
  });
}
