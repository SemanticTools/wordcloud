// TF-IDF over a corpus, used to learn which words are "common" (uninformative).
//
// Intuition: a stopword is a word that appears in a large fraction of documents
// regardless of topic. In TF-IDF terms such a word has a very low inverse
// document frequency (IDF = ln(N / df)) and therefore a low TF-IDF score in
// every document — it is never distinctive anywhere. We compute the full
// TF-IDF picture and select common words by thresholding on document frequency
// (which is exactly an IDF threshold, since the two are monotonically related).
//
// All functions operate on an array of *documents*, where each document is an
// array of tokens WITH repeats preserved (see tokenizeAll).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IDF_MODEL_PATH = join(__dirname, '..', 'data', 'idf-model.json');

// term -> number of documents containing it (document frequency).
export function computeDocumentFrequencies(documents) {
  const df = new Map();
  for (const tokens of documents) {
    for (const term of new Set(tokens)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return df;
}

// term -> ln(N / df). Rare terms score high, ubiquitous terms score near zero.
export function computeIdf(df, documentCount) {
  const idf = new Map();
  for (const [term, freq] of df) {
    idf.set(term, Math.log(documentCount / freq));
  }
  return idf;
}

// Train a common-word list from a corpus.
//
// Returns:
//   words         - common words, most-common first
//   documentCount - number of documents
//   threshold     - the fraction used
//   stats         - per-selected-word details { word, df, fraction, idf, meanTfidf }
//
// A word is "common" when it appears in at least `threshold` of the documents.
export function trainCommonWords(documents, { threshold = 0.3 } = {}) {
  const documentCount = documents.length;
  if (documentCount === 0) {
    return { words: [], documentCount: 0, threshold, stats: [] };
  }

  const df = computeDocumentFrequencies(documents);
  const idf = computeIdf(df, documentCount);

  // Accumulate each term's total TF-IDF across documents so we can report the
  // mean (a secondary signal of how meaningful the term ever is).
  const tfidfSum = new Map();
  for (const tokens of documents) {
    const counts = new Map();
    for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1);
    const total = tokens.length || 1;
    for (const [term, count] of counts) {
      const tfidf = (count / total) * idf.get(term);
      tfidfSum.set(term, (tfidfSum.get(term) ?? 0) + tfidf);
    }
  }

  const stats = [];
  for (const [term, freq] of df) {
    const fraction = freq / documentCount;
    if (fraction >= threshold) {
      stats.push({
        word: term,
        df: freq,
        fraction,
        idf: idf.get(term),
        meanTfidf: tfidfSum.get(term) / freq,
      });
    }
  }

  // Most ubiquitous first; break ties by lowest mean TF-IDF (most generic).
  stats.sort((a, b) => b.fraction - a.fraction || a.meanTfidf - b.meanTfidf);

  return {
    words: stats.map((s) => s.word),
    documentCount,
    threshold,
    stats,
  };
}

// Build a serialisable IDF model from a corpus, for per-request tf-idf scoring
// (REFINE T2). `defaultIdf` is the IDF assigned to words unseen in training —
// we treat an unseen word as maximally rare (df = 1) so distinctive new words
// score high.
//
// Returns { documentCount, defaultIdf, idf: { word: idfValue } }.
export function buildIdfModel(documents) {
  const documentCount = documents.length;
  if (documentCount === 0) {
    return { documentCount: 0, defaultIdf: 0, idf: {} };
  }
  const df = computeDocumentFrequencies(documents);
  const idfMap = computeIdf(df, documentCount);
  const idf = Object.fromEntries(idfMap);
  return { documentCount, defaultIdf: Math.log(documentCount), idf };
}

// Load a trained IDF model (written by train.mjs) into a fast lookup form:
//   { documentCount, defaultIdf, idf: Map<word, value>, score(word, freq) }
// Returns null if the file is absent (the pipeline then falls back to idf = 1).
export async function loadIdfModel(path = IDF_MODEL_PATH) {
  let data;
  try {
    data = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to read IDF model at ${path}: ${err.message}`);
  }
  const idf = new Map(Object.entries(data.idf ?? {}));
  const defaultIdf = typeof data.defaultIdf === 'number' ? data.defaultIdf : 0;
  return {
    documentCount: data.documentCount ?? 0,
    defaultIdf,
    idf,
    idfFor: (word) => (idf.has(word) ? idf.get(word) : defaultIdf),
  };
}
