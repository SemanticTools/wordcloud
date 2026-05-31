// Entry point: load config, wire the wordcloud pipeline + Wikipedia client into
// the HTTP server, and start listening.

import { loadConfig } from './config.mjs';
import { createWikipediaClient } from './wikipedia.mjs';
import { generateWordcloud } from './wordcloud.mjs';
import { buildStopwordSet, STOPWORDS } from './stopwords.mjs';
import { loadIdfModel } from './tfidf.mjs';
import { createServer } from './server.mjs';

async function main() {
  const config = await loadConfig();
  const wiki = createWikipediaClient(config.wikipedia);

  // Curated baseline ∪ trained common words (data/common-words.json, if present).
  const stopwords = await buildStopwordSet();
  const trainedCount = stopwords.size - STOPWORDS.size;

  // Trained IDF model for tf-idf scoring (data/idf-model.json, if present).
  const idfModel = await loadIdfModel();

  // The pipeline closure the server calls for each request.
  const generate = (textblock, opts = {}) =>
    generateWordcloud(textblock, { wiki, config, stopwords, idfModel, ...opts });

  const server = createServer({ config, generate });
  const { host, port } = config.server;

  server.listen(port, host, () => {
    console.log(`wordcloud-server listening on http://${host}:${port}`);
    console.log(`  - UI:           http://${host}:${port}/`);
    console.log(`  - chat API:     POST http://${host}:${port}/v1/chat/completions`);
    console.log(`  - wikipedia:    ${config.wikipedia.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  - stopwords:    ${stopwords.size} (${STOPWORDS.size} baseline + ${trainedCount} trained)`);
    console.log(`  - idf model:    ${idfModel ? `${idfModel.idf.size} terms` : 'none (scores = term frequency)'}`);
  });

  const shutdown = (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    server.close(() => process.exit(0));
    // Force-exit if connections linger.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
