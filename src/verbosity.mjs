// Verbosity prefixes for the wordcloud prompt and the dynamic word-cap formula.
//
// The prompt may carry an optional modifier before "give me a wordcloud for:":
//
//   [<modifier>, ]give me a wordcloud for: <textblock>
//
// The modifier picks a verbosity level whose multiplier X scales the cap:
//
//   CAP = round(wordsPerPromptWord × X × uniquePromptWords)   (the *total* cloud size)
//
// except "Max N", which is a hard absolute cap of N (ignores the formula and the
// safety ceiling). The multiplier path is clamped to maxWordsHardLimit so a long
// prompt × "Full" can't blow up.

// verbosity -> multiplier X. `max` is absolute (multiplier carried as null).
export const VERBOSITY = {
  brief: { multiplier: 0.25 },
  concise: { multiplier: 0.5 },
  normal: { multiplier: 1 },
  verbose: { multiplier: 2 },
  full: { multiplier: 10 },
  max: { multiplier: null },
};

// Match a recognised modifier phrase (already comma-split off the prompt) to a
// verbosity level. Returns { verbosity, maxN } or null when unrecognised (the
// caller falls back to normal). Case-insensitive.
export function parseModifier(modifier) {
  const m = (modifier ?? '').trim();
  if (m === '') return { verbosity: 'normal', maxN: null };

  const max = m.match(/^max\s+(\d+)$/i);
  if (max) return { verbosity: 'max', maxN: Number(max[1]) };

  if (/^very brief$/i.test(m)) return { verbosity: 'brief', maxN: null };
  if (/^concisely$/i.test(m)) return { verbosity: 'concise', maxN: null };
  if (/^verbosely$/i.test(m)) return { verbosity: 'verbose', maxN: null };
  if (/^full$/i.test(m)) return { verbosity: 'full', maxN: null };

  return null; // unrecognised -> caller uses normal
}

// Compute the total cloud cap for a request.
//
//   verbosity          one of VERBOSITY's keys
//   maxN               required integer when verbosity === 'max'
//   uniquePromptWords  raw unique tokens in the prompt (no stopword/length filter)
//   config             provides wordsPerPromptWord (default 10) and
//                      maxWordsHardLimit (default 1000)
export function computeCap({ verbosity = 'normal', maxN = null, uniquePromptWords, config = {} }) {
  if (verbosity === 'max') {
    return Math.max(0, Math.floor(maxN ?? 0));
  }
  const normal = config.wordsPerPromptWord ?? 10;
  const hardLimit = config.maxWordsHardLimit ?? 1000;
  const x = VERBOSITY[verbosity]?.multiplier ?? 1;
  const raw = Math.round(normal * x * uniquePromptWords);
  return Math.min(raw, hardLimit);
}

// The numeric multiplier for a verbosity (for metadata). `max` reports its N.
export function multiplierFor(verbosity, maxN) {
  if (verbosity === 'max') return maxN ?? null;
  return VERBOSITY[verbosity]?.multiplier ?? 1;
}
