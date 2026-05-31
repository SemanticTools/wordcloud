# Implementation Status

_Last updated: 2026-05-31 (REFINE: structured envelope + verbosity cap)_

## Summary

Fully functional. The server accepts the ChatGPT-style prompt (now with optional
verbosity modifiers), builds a Wikipedia-enriched wordcloud, and returns a
structured `{ metadata, data }` envelope via an OpenAI-compatible API. Each word
carries a tf-idf **score** and a graph **distance**. A TF-IDF **trainer** learns
both a data-driven stopword list and an IDF model from random Wikipedia articles.
All 59 tests pass; verified end-to-end against live Wikipedia.

## Recent changes

- **REFINE delivered** (per `plan/REFINE.md`): the two refinements are live.
  - **Structured response.** The pipeline returns `{ metadata, data }` (was a
    bare word array). Each word has `{ word, distance, score, seed }`, sorted by
    score descending; `metadata` carries stats (counts, cap, per-stage timing).
    The assistant message content is the stringified envelope — this breaks the
    old array contract by design.
  - **tf-idf scoring (T2).** `score = requestFreq × idf`. The trainer now also
    writes `data/idf-model.json` (a per-word IDF model); the server loads it.
    Unseen words get a default high IDF; with no model, score = term frequency.
  - **Distance = graph hop-count.** Seeds = hop 0, words on a seed's article =
    hop 1, normalised `distance = hops / crawl.maxDepth`. No page-hopping yet
    (single hop), so article words are at distance 1; the field/pipeline are
    structured for future multi-hop crawling.
  - **Verbosity word cap.** Prompt prefix (`Very brief` / `Concisely` / *(none)*
    / `Verbosely` / `Full` / `Max N`) sets `cap = round(wordsPerPromptWord × X ×
    uniquePromptWords)`. Seeds always kept; the multiplier path is clamped to
    `maxWordsHardLimit`; `Max N` is an absolute cap. New module `src/verbosity.mjs`.
  - **GUI.** Verbosity selector, tags sized by score (seeds highlighted),
    score/distance tooltips, and a metadata summary line.
  - New config keys: `wordsPerPromptWord` (replaces `maxWords`),
    `maxWordsHardLimit`, `crawl.maxDepth`, `training.idfOutputPath`.

## Earlier changes

- **Ranked, capped output**: the pipeline previously returned *every* unique word
  from every full article (e.g. ~2800 words for "quantum physics"). It now counts
  term frequency across the fetched articles, keeps the seed words plus the most
  salient article words, and caps the result at `maxWords` (default 50).

- **TF-IDF stopword trainer** (`src/train.mjs`, `src/tfidf.mjs`, `script/train.sh`):
  samples random Wikipedia articles, computes TF-IDF, and writes the
  high-document-frequency ("common") words to `data/common-words.json`. The
  server unions this with the curated baseline at startup.
- **Fixed a Wikipedia client bug**: the TextExtracts API caps `exlimit` to 1 for
  whole-article extracts, so the old batched request silently returned only the
  *first* article per batch. The client now fetches one title per request with
  bounded `concurrency`. (Config `wikipedia.batchSize` → `wikipedia.concurrency`.)
- Added `script/restart.sh`; `start.sh` now logs which process holds the port if
  startup fails.

## Implemented

- [x] Project scaffold per `plan/CODING.md` (`src/`, `src-static/`, `script/`,
      `test/`, `config.json`), `.mjs` modules, no classes, zero dependencies.
- [x] `config.mjs` — load + deep-merge `config.json` over defaults.
- [x] `tokenizer.mjs` — unique, lowercased, min-length tokens.
- [x] `stopwords.mjs` — curated English stopword set + `removeStopwords`.
- [x] `wikipedia.mjs` — batched MediaWiki Action API client (full plain-text
      extracts, redirects, timeout/abort, resilient per-batch error handling).
- [x] `wordcloud.mjs` — the full pipeline (tokenize → destopword → lookup →
      score → cap), returning `{ metadata, data }`, with offline/disabled fallback.
- [x] `verbosity.mjs` — modifier parsing + dynamic word-cap formula.
- [x] `openai.mjs` — prompt parsing (with verbosity) + OpenAI completion/error/model envelopes.
- [x] `server.mjs` — `/v1/chat/completions`, `/v1/models`, `/healthz`, static UI
      hosting with path-traversal guard and body-size cap.
- [x] `tfidf.mjs` + `train.mjs` — TF-IDF trainer producing `data/common-words.json`
      and `data/idf-model.json` (per-word IDF model for scoring).
- [x] `stopwords.mjs` — `loadCommonWords` / `buildStopwordSet` (baseline ∪ trained).
- [x] `src-static/` — minimal chat-style browser UI.
- [x] `script/` — `setup.sh`, `start.sh`, `stop.sh`, `restart.sh`, `status.sh`, `train.sh`.
- [x] `test/` — tokenizer, stopwords (+loading), openai, wordcloud (fake wiki),
      server, tfidf, train (fake wiki).

## Known limitations

- **No streaming.** `stream: true` requests are served as a single
  non-streaming response.
- **No caching.** Each request re-fetches Wikipedia articles.
- **English only.** Stopword list and default API are English (`en`).
- **Lossy token usage.** `usage` counts are rough character-based estimates.
- **No auth / rate limiting.** Intended for local/trusted use.

## Suggested next steps

1. **Caching** — memoize article extracts (in-memory LRU or on-disk) keyed by
   title to cut latency and Wikipedia load.
2. **Multi-hop crawling** — the distance field is built for it but unused: follow
   article links to harvest hop-2+ words, giving `distance` a real gradient
   (`hops / crawl.maxDepth`). The current single hop pins article words at 1.
3. **Streaming** — optional SSE support for `stream: true`.
4. **Multi-language** — language-specific stopword lists + configurable wiki
   language.
5. **Rate limiting / API keys** — for any non-local deployment.
6. **Richer extraction** — strip residual wiki artifacts, lemmatize/stem to
   collapse plurals and inflections; consider TF-IDF (not raw frequency) for
   ranking so generic-but-frequent words sink.
