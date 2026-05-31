// The core pipeline: turn a block of text into a wordcloud — the most salient
// terms drawn from the text and the Wikipedia articles of its significant words.
//
// Returns a structured envelope (REFINE 1c/1d):
//   { metadata: {...stats}, data: [{ word, distance, score, seed }, ...] }
//
// - distance is a graph hop-count normalised by crawl.maxDepth: seeds = hop 0,
//   words on a seed's own article = hop 1, etc. We only read seed articles for
//   now (single hop), so article words land at distance hops/maxDepth.
// - score = requestFreq(word) × idf(word), where requestFreq counts the word
//   across the prompt and all fetched articles and idf comes from the trained
//   model (default high idf for unseen words; idf = 1 if no model is loaded).
// - cap (total cloud size) comes from the verbosity multiplier; seed words are
//   always kept even if they overflow it, and article words fill the remainder.

import { performance } from 'node:perf_hooks';
import { tokenize, tokenizeAll } from './tokenizer.mjs';
import { removeStopwords, STOPWORDS } from './stopwords.mjs';
import { computeCap, multiplierFor } from './verbosity.mjs';

// idf lookup: trained model value, default for unseen, or 1 when no model.
function makeIdfLookup(idfModel) {
  if (idfModel && typeof idfModel.idfFor === 'function') return idfModel.idfFor.bind(idfModel);
  return () => 1;
}

// Sort wordcloud entries by score descending, ties broken alphabetically, so the
// result is deterministic and the most characteristic words come first.
function byScoreDesc(a, b) {
  return b.score - a.score || (a.word < b.word ? -1 : 1);
}

export async function generateWordcloud(
  textblock,
  {
    wiki,
    config = {},
    stopwords = STOPWORDS,
    idfModel = null,
    verbosity = 'normal',
    maxN = null,
    clock = () => performance.now(),
  } = {},
) {
  const start = clock();
  const minLength = config.minWordLength ?? 3;
  const wikiCfg = config.wikipedia ?? {};
  const maxDepth = config.crawl?.maxDepth ?? 1;
  const idfFor = makeIdfLookup(idfModel);

  // Raw unique tokens drive the cap (no stopword / length filter, per 2a).
  const uniquePromptWords = tokenize(textblock, { minLength: 1 }).length;
  const cap = computeCap({ verbosity, maxN, uniquePromptWords, config });

  // Seed words: the input's own meaningful words (stopwords removed).
  const seedWords = removeStopwords(tokenize(textblock, { minLength }), stopwords);
  const seedSet = new Set(seedWords);

  // requestFreq accumulates word counts across the prompt and every article, so
  // a word's tf reflects the whole request corpus.
  const requestFreq = new Map();
  const bump = (word, n = 1) => requestFreq.set(word, (requestFreq.get(word) ?? 0) + n);
  for (const word of tokenizeAll(textblock, { minLength })) {
    if (!stopwords.has(word)) bump(word);
  }

  const meta = (extra) => ({
    input: textblock,
    verbosity,
    multiplier: multiplierFor(verbosity, maxN),
    uniquePromptWords,
    seedWords: seedWords.length,
    cap,
    ...extra,
    elapsedMs: Math.round(clock() - start),
  });

  const useWiki = wiki && wikiCfg.enabled !== false && seedWords.length > 0;
  if (!useWiki) {
    // Offline / disabled: only seed words, scored from the idf model.
    const data = seedWords
      .map((word) => ({
        word,
        distance: 0,
        score: (requestFreq.get(word) ?? 1) * idfFor(word),
        seed: true,
      }))
      .sort(byScoreDesc);
    return {
      metadata: meta({
        articlesRequested: 0,
        articlesFound: 0,
        wordsDiscovered: seedWords.length,
        commonWordsPruned: 0,
        returned: data.length,
        fetchMs: 0,
        processMs: 0,
      }),
      data,
    };
  }

  // Fetch articles for the seed words, capped at maxLookups.
  const maxLookups = wikiCfg.maxLookups ?? 50;
  const lookupWords = seedWords.slice(0, maxLookups);
  const fetchStart = clock();
  const articles = await wiki.fetchArticles(lookupWords);
  const fetchMs = Math.round(clock() - fetchStart);

  // Harvest article words (hop 1): accumulate frequency, track distinct pruned
  // common words for the stats.
  const processStart = clock();
  const prunedWords = new Set();
  for (const { extract } of articles) {
    for (const word of tokenizeAll(extract, { minLength })) {
      if (stopwords.has(word)) {
        prunedWords.add(word);
        continue;
      }
      bump(word);
    }
  }

  // Candidate article words = harvested words that aren't seeds. hop = 1.
  const articleEntries = [];
  for (const word of requestFreq.keys()) {
    if (seedSet.has(word)) continue;
    articleEntries.push({
      word,
      distance: maxDepth > 0 ? 1 / maxDepth : 1,
      score: requestFreq.get(word) * idfFor(word),
      seed: false,
    });
  }
  articleEntries.sort(byScoreDesc);

  // Seeds are always included (distance 0); article words fill up to `cap`.
  const seedEntries = seedWords.map((word) => ({
    word,
    distance: 0,
    score: (requestFreq.get(word) ?? 1) * idfFor(word),
    seed: true,
  }));
  const remaining = Math.max(0, cap - seedEntries.length);
  const data = [...seedEntries, ...articleEntries.slice(0, remaining)].sort(byScoreDesc);

  const wordsDiscovered = seedSet.size + articleEntries.length;
  const processMs = Math.round(clock() - processStart);

  return {
    metadata: meta({
      articlesRequested: lookupWords.length,
      articlesFound: articles.length,
      wordsDiscovered,
      commonWordsPruned: prunedWords.size,
      returned: data.length,
      fetchMs,
      processMs,
    }),
    data,
  };
}
