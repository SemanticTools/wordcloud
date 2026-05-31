# Wordcloud Server

Turn a block of text into a **wordcloud** — a ranked list of the meaningful terms
in the text, enriched with the most characteristic words from the Wikipedia
articles of those terms.

It's a small Node.js HTTP server that speaks the **OpenAI Chat Completions**
wire format, so you can point any OpenAI-compatible client at it. Zero runtime
dependencies (just Node's built-in `http`, `fetch`, and `node:test`).

## What it actually does

Send it the prompt `Give me a wordcloud for: <your text>` and it:

1. Splits the text into words and drops stopwords (*it, they, has, is, …*),
   leaving the **seed** words.
2. Looks each seed word up on **Wikipedia** and downloads its article.
3. Harvests the words from those articles and **scores** every candidate by
   tf-idf — how characteristic it is — keeping the most salient ones.
4. Returns a structured `{ metadata, data }` JSON object: a ranked word list
   (each with a score and a distance) plus stats about the run.

There's also a small browser UI at `/` for trying it out interactively.

## Quick start

```bash
script/setup.sh     # check Node 18+ and config
script/start.sh     # start in the background (logs -> server.log)
# open http://127.0.0.1:3000/ in a browser, or:

curl -s localhost:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Give me a wordcloud for: The Eiffel Tower is in Paris, France."}]}'

script/stop.sh      # stop
```

Other scripts: `script/status.sh`, `script/restart.sh`, and `script/train.sh`
(see below).

## Controlling the size

Prefix the prompt with a verbosity modifier to scale how many words come back
(`cap = wordsPerPromptWord × X × uniquePromptWords`):

| Prompt prefix | Size |
| --- | --- |
| `Very brief, Give me a wordcloud for: …` | smallest (×0.25) |
| `Concisely, Give me a wordcloud for: …` | small (×0.5) |
| `Give me a wordcloud for: …` | normal (×1) |
| `Verbosely, Give me a wordcloud for: …` | large (×2) |
| `Full, Give me a wordcloud for: …` | largest (×10) |
| `Max 25, Give me a wordcloud for: …` | exactly 25 words |

## Training (recommended)

The quality of both the stopword filtering and the tf-idf scores improves a lot
once you train them from real text:

```bash
script/train.sh                 # sample random Wikipedia articles
script/restart.sh               # reload the trained data
```

This writes `data/common-words.json` (a learned stopword list) and
`data/idf-model.json` (the IDF model used for scoring). Without them the server
still works, using a built-in stopword baseline and plain word frequency.

## Tests

```bash
npm test
```

## More

- **`plan/README.md`** — full architecture, the complete config reference, and
  the detailed API contract.
- **`plan/STATUS.md`** — implementation status and next steps.
- **`config.json`** — host/port, Wikipedia settings, cap and training options.
