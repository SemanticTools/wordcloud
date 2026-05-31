// A curated set of common English "stopwords" — high-frequency function words
// (articles, pronouns, auxiliaries, prepositions, conjunctions) that carry
// little topical meaning and should be stripped from a wordcloud.
//
// This hand-written baseline can be augmented at runtime with a data-driven
// list learned by the trainer (see src/train.mjs -> data/common-words.json).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMON_WORDS_PATH = join(__dirname, '..', 'data', 'common-words.json');

export const STOPWORDS = new Set([
  // articles & determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'every', 'either',
  'neither', 'any', 'all', 'some', 'no', 'none', 'such', 'other', 'another',
  'much', 'many', 'most', 'more', 'few', 'fewer', 'less', 'least', 'own', 'same',
  // pronouns
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
  'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they',
  'them', 'their', 'theirs', 'themselves', 'who', 'whom', 'whose', 'which',
  'what', 'whatever', 'whoever', 'whomever', 'one', 'ones', 'oneself',
  // auxiliary & common verbs
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
  'having', 'do', 'does', 'did', 'doing', 'done', 'will', 'would', 'shall',
  'should', 'can', 'could', 'may', 'might', 'must', 'ought', 'need', 'dare',
  'get', 'gets', 'got', 'gotten', 'let', 'lets',
  // prepositions
  'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
  'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'upon', 'within',
  'without', 'along', 'across', 'behind', 'beyond', 'near', 'around', 'among',
  // conjunctions & connectives
  'and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'as', 'until', 'while',
  'if', 'unless', 'although', 'though', 'whereas', 'since', 'than', 'whether',
  // adverbs & misc high-frequency
  'not', 'only', 'just', 'also', 'too', 'very', 'really', 'quite', 'rather',
  'almost', 'always', 'never', 'often', 'sometimes', 'usually', 'still', 'even',
  'ever', 'now', 'soon', 'already', 'however', 'therefore', 'thus', 'hence',
  'else', 'instead', 'indeed', 'perhaps', 'maybe', 'well', 'like', 'about',
  'both', 'between', 'few', 'more', 'most', 'some', 'such',
  // contractions' fragments & leftovers
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't",
  "won't", "wouldn't", "can't", "couldn't", "shouldn't", "mustn't", "hasn't",
  "haven't", "hadn't", "it's", "i'm", "you're", "they're", "we're", "i've",
  'etc', 'eg', 'ie', 'vs',
]);

// Return the subset of `words` that are not stopwords.
export function removeStopwords(words, stopwords = STOPWORDS) {
  return words.filter((word) => !stopwords.has(word));
}

// Read the trained common-words list (array, or { words: [...] }). Returns an
// empty array if the file doesn't exist yet (i.e. the trainer hasn't run).
export async function loadCommonWords(path = COMMON_WORDS_PATH) {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    const words = Array.isArray(data) ? data : data.words ?? [];
    return words.filter((w) => typeof w === 'string');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`Failed to read common words at ${path}: ${err.message}`);
  }
}

// Build the effective stopword set: curated baseline ∪ trained common words.
export async function buildStopwordSet(path = COMMON_WORDS_PATH) {
  const trained = await loadCommonWords(path);
  return new Set([...STOPWORDS, ...trained]);
}
