# Wordcloud Server

An OpenAI-compatible HTTP server that turns a block of text into a **wordcloud**
— a unique list of meaningful terms, enriched with words drawn from the
Wikipedia articles of the text's own significant words.

Built with Node.js (`.mjs` ES modules, no classes) and **zero runtime
dependencies** — it relies only on Node's built-in `http`, `fetch`, and
`node:test`.

## How it works

When the server receives the prompt `[<modifier>, ]Give me a wordcloud for: <text>`, it:

1. **Tokenizes** the text into unique lowercased words.
2. **Removes stopwords** — common words like *it, they, has, is, will* that
   carry little meaning — leaving the "seed" words.
3. **Looks up Wikipedia** for each seed word (capped at `maxLookups`),
   downloading the full plain-text article for any word that has one.
4. **Tokenizes and de-stopwords** every fetched article, **counting term
   frequency** across the prompt and all articles.
5. **Scores** each word `score = requestFreq × idf` (idf from the trained
   model — see Training), assigns a **distance** (graph hop-count: seeds = 0,
   article words = 1), and keeps the seed words plus the highest-scoring article
   words, **capped** by the verbosity-driven cap (see below). A wordcloud is the
   *salient* vocabulary, not every word — a full article has thousands of terms.
6. Returns a **stringified `{ metadata, data }` JSON object** in the assistant
   message (see [API](#api)).

### Verbosity & the word cap

An optional modifier before the prompt scales the cap. The cap is the **total**
cloud size: `cap = round(wordsPerPromptWord × X × uniquePromptWords)`, where
`uniquePromptWords` counts raw prompt tokens (stopwords included). Seed words are
always kept even if they overflow the cap; article words fill the remainder.

| Modifier | Verbosity | X | Notes |
| --- | --- | --- | --- |
| `Very brief, ` | brief | 0.25 | |
| `Concisely, ` | concise | 0.5 | |
| *(none)* | normal | 1 | |
| `Verbosely, ` | verbose | 2 | |
| `Full, ` | full | 10 | clamped to `maxWordsHardLimit` |
| `Max <N>, ` | max | — | hard absolute cap of N (ignores the formula) |

An unrecognised modifier falls back to `normal`. The multiplier path is clamped
to `maxWordsHardLimit` so `Full` on a long prompt can't blow up; `Max N` is exempt.

## Architecture

```
config.json                  config: server host/port, wikipedia, cap, model, training
data/common-words.json       trained stopword list (produced by the trainer)
data/idf-model.json          trained IDF model for tf-idf scoring (produced by the trainer)
src/
  config.mjs                 load + deep-merge config.json over defaults
  stopwords.mjs              STOPWORDS baseline + removeStopwords + buildStopwordSet (∪ trained)
  tokenizer.mjs              tokenize() (unique) / tokenizeAll() (with repeats, for TF-IDF)
  verbosity.mjs              parseModifier / computeCap — verbosity prefixes + word-cap formula
  wikipedia.mjs              createWikipediaClient(cfg).fetchArticles(words)  (one req/title)
  tfidf.mjs                  TF-IDF + trainCommonWords + buildIdfModel / loadIdfModel
  train.mjs                  trainer CLI: sample articles -> common-words.json + idf-model.json
  wordcloud.mjs              generateWordcloud(...) -> { metadata, data }  (the pipeline)
  openai.mjs                 parsePrompt / buildCompletion / buildError / buildModelList
  server.mjs                 createServer({ config, generate }) — HTTP routing + static
  index.mjs                  entry point: load trained stopwords, wire deps, listen
src-static/                  browser UI (index.html, app.js, styles.css)
script/                      setup.sh, start.sh, stop.sh, restart.sh, status.sh, train.sh
test/                        node:test unit + server tests
```

The pipeline and Wikipedia client are **dependency-injected** into the server,
so everything is testable offline (tests inject a fake Wikipedia client).

## Configuration (`config.json`)

| Key | Default | Meaning |
| --- | --- | --- |
| `server.host` | `127.0.0.1` | Bind address |
| `server.port` | `3000` | Port |
| `wikipedia.apiUrl` | `https://en.wikipedia.org/w/api.php` | MediaWiki Action API endpoint |
| `wikipedia.userAgent` | `wordcloud-server/1.0 ...` | Sent on every request (Wikipedia requires a descriptive UA) |
| `wikipedia.maxLookups` | `50` | Max seed words looked up per request |
| `wikipedia.concurrency` | `8` | Max simultaneous article requests (the API caps whole-article extracts to one title per request, so titles can't be batched) |
| `wikipedia.timeoutMs` | `10000` | Per-request timeout |
| `wikipedia.enabled` | `true` | If `false`, returns only the cleaned seed words (offline mode) |
| `model` | `wordcloud-1` | Model id advertised by the API |
| `minWordLength` | `3` | Tokens shorter than this are dropped |
| `wordsPerPromptWord` | `10` | "Normal" words-per-prompt-word in the cap formula (replaces `maxWords`) |
| `maxWordsHardLimit` | `1000` | Ceiling for the multiplier cap path (`Max N` is exempt) |
| `crawl.maxDepth` | `1` | Hop depth for harvesting; also normalises `distance` |
| `maxRequestBytes` | `1048576` | Max request body size |
| `training.documentCount` | `50` | Random articles to sample when training |
| `training.threshold` | `0.3` | Document-frequency fraction above which a word is "common" |
| `training.outputPath` | `data/common-words.json` | Where the trained stopword list is written/read |
| `training.idfOutputPath` | `data/idf-model.json` | Where the trained IDF model is written/read |

A missing `config.json` is fine — built-in defaults apply.

## Running

```bash
script/setup.sh     # verify Node 18+, install deps, check config
script/start.sh     # start in background (PID -> .server.pid, logs -> server.log)
script/status.sh    # check process + /healthz
script/restart.sh   # stop then start
script/stop.sh      # stop

# or run in the foreground:
npm start
```

## Training the stopword list

The built-in stopword list is a hand-written baseline. To catch the *many* other
common words (and Wikipedia boilerplate like "references", "external", "links"),
train a data-driven list from real text:

```bash
script/train.sh                              # uses config.training defaults (50 docs, 0.3)
script/train.sh --count 100 --threshold 0.25 # sample more, be more aggressive
npm run train -- --count 100                 # equivalent
```

How it works (`src/train.mjs` + `src/tfidf.mjs`):

1. Download a sample of **random** Wikipedia articles.
2. Compute **TF-IDF** across them. A stopword is a word that appears in a large
   fraction of documents regardless of topic — i.e. it has very low inverse
   document frequency (IDF = `ln(N / df)`) and is never distinctive anywhere.
3. **Select** every word whose document-frequency fraction is at or above the
   `threshold` (a lower threshold = more aggressive = more words removed) and
   write them to `data/common-words.json`.
4. Also write the full per-word **IDF model** to `data/idf-model.json`. The
   server loads it to compute each output word's `score = requestFreq × idf`, so
   distinctive-but-globally-rare words rank highest. Words unseen in the model
   get a default high IDF (`ln(N)`).

On startup the server unions the trained stopword list with the curated baseline
and loads the IDF model. **Re-run training, then `script/restart.sh`** to apply.
If `common-words.json` is absent the server uses the baseline; if
`idf-model.json` is absent, scores fall back to plain term frequency (`idf = 1`).

## API

### `POST /v1/chat/completions`
OpenAI Chat Completions shape. Streaming is **not** supported (responses are
always non-streaming).

```bash
curl -s localhost:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
        "model": "wordcloud-1",
        "messages": [
          { "role": "user", "content": "Concisely, Give me a wordcloud for: The Eiffel Tower is in Paris, France." }
        ]
      }'
```

The assistant message `content` is a **stringified `{ metadata, data }` object**.
`data` is sorted by `score` descending; seed words carry `distance: 0` and
`seed: true`:

```jsonc
{
  "metadata": {
    "input": "The Eiffel Tower is in Paris, France.",
    "verbosity": "concise", "multiplier": 0.5,
    "uniquePromptWords": 7, "seedWords": 4,
    "articlesRequested": 4, "articlesFound": 4,
    "wordsDiscovered": 5286, "commonWordsPruned": 145,
    "cap": 35, "returned": 35,
    "elapsedMs": 484, "fetchMs": 458, "processMs": 26
  },
  "data": [
    { "word": "paris",  "distance": 0, "score": 399.0, "seed": true },
    { "word": "french", "distance": 1, "score": 253.0, "seed": false }
  ]
}
```

Malformed requests (bad JSON, missing/incorrect prompt format) return a
`400` with an OpenAI-shaped `{ "error": { ... } }` body.

### `GET /v1/models`
Lists the configured model.

### `GET /healthz`
Liveness probe → `{ "status": "ok" }`.

### Browser UI
Open `http://127.0.0.1:3000/` — paste text, pick a **verbosity** (and N for
`Max N`), click **Generate**. Words render as tags **sized by score** (seed words
highlighted), each with a tooltip showing score + distance, above a metadata
summary line.

## Testing

```bash
npm test        # node --test
```

Covers the tokenizer, stopwords, prompt parsing / response building, the full
pipeline (with an injected fake Wikipedia client), and the HTTP server routes.
