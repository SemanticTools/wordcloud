// Turns a block of text into word tokens.

// Matches words made of letters, optionally joined by a single apostrophe or
// hyphen (e.g. "don't", "well-known"). Numbers and symbols are ignored.
const WORD_RE = /[a-z]+(?:['-][a-z]+)*/g;

// Tokenize `text` into ALL word tokens (repeats preserved, document order),
// lowercased and filtered to `minLength`. Useful for frequency counting.
export function tokenizeAll(text, { minLength = 3 } = {}) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const matches = text.toLowerCase().match(WORD_RE) ?? [];
  return matches.filter((word) => word.length >= minLength);
}

// Tokenize `text` into unique words, preserving first-seen order.
// Tokens shorter than `minLength` are dropped.
export function tokenize(text, options) {
  const seen = new Set();
  const result = [];
  for (const word of tokenizeAll(text, options)) {
    if (seen.has(word)) continue;
    seen.add(word);
    result.push(word);
  }
  return result;
}
