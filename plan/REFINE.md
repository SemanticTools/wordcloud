1#  the resturn from the API

We should return a json string, with structured data.
In it we have metadata and data.
The data will be a list of words, with their distance (to be discussed) from the input sentence and itdf score.
the metadata will be, how many words we found. how many common words we pruned. and other stats, helpfull to improve performance of out program

Score should be shown in the gui.

2#  word cap.

Our input looks like: 

Give me a wordcloud for: <textblock>

Lets also introduce:

a. Max NN, give me a wordcloud for: <textblock>
b. Very brief, give me a wordcloud for: <textblock>
c. Concisely, give me a wordcloud for: <textblock>
d. Give me a wordcloud for: <textblock>   (the normal one)
e. Verbosely, give me a wordcloud for: <textblock>
f. Full, give me a wordcloud for: <textblock>

A. this hard caps the cloud.

Before going into the rest, here is the mechanism for these.
We take a normal value from the config, and multiplies it with X.
That we multiply with the actual unique wordcount in the prompt.
That gives us our hard CAP.
Example: What is physics.  -> Unique = 3.  Normal = 10.  X is 1 -> 30 words (3*10*1).

B. X is .25, C. X is .5, D. X is 1. E. X is 2.  F. X is 10

---

# Discussion (Claude)

Below: how I read each requirement, the decisions I think we need to make, and a
recommendation for each. Reply inline (or tell me in chat) and I'll lock it in.

## 1# — API return shape

Agreed: return a JSON **string** whose content is `{ metadata, data }`. This
changes the current contract (today the assistant message is a bare
`["word", ...]` array), so existing array-consumers break — that's fine, just
noting it.

### 1a. What is "distance"? (the open question)

Our pipeline is **one hop**: prompt words (seed) → fetch each seed word's
Wikipedia article → harvest words from those articles. So "distance to the
input" has to be derived from that structure. Options:

- **D1 — Article coverage.** `distance = 1 − (#seedArticles containing word / #seedArticles)`.
  A word that shows up in *many* of the input's articles is central to the
  whole input → small distance. Intuitive, but coarse: with 3 seed articles you
  only get distances {0, .33, .67}.
- **D2 — Frequency.** `distance = 1 − freq/(maxFreq+1)` over all fetched article
  text. Smooth, but a word repeated a lot in *one* article looks "close" even if
  it's only related to one corner of the input.
- **D3 — Hybrid (recommended).** `distance = 1 − (α·coverage + (1−α)·freqNorm)`,
  α≈0.6. Combines "appears across many input topics" with "appears often."
- **D4 — True semantic distance** (word embeddings / vector cosine). The only
  option that's "distance" in the real sense, but needs an embeddings model or
  API → breaks the zero-dependency design. Probably out of scope unless you want
  it.

Seed words are pinned at **distance 0** in all options (they *are* the input).

❓ **Decision:** D1, D3, or D4? (I lean D3.)

### 1b. The tf-idf score

You want a tf-idf score per word *as well as* distance. Good — they measure
different things, so both are useful:
- **distance** = how connected the word is to *your input*.
- **tf-idf score** = how *characteristic / important* the word is.

Which corpus defines idf?
- **T1 — This request's seed articles only.** Self-contained, but the corpus is
  tiny (often 2–5 docs) so idf is very coarse.
- **T2 — Reuse the trainer (recommended).** Have `train.mjs` *also* write an
  idf model (`data/idf-model.json`: word→idf over the sampled corpus). Then
  `score = tf_in_this_request × idf_trained`. Distinctive-and-globally-rare
  words score high; this elegantly reuses the training step we already built.
  Words unseen in the model get a default high idf.

❓ **Decision:** T1 or T2? (I lean T2 — it makes the trainer pull double duty.)

### 1c. Metadata fields

Proposed:
```
input               the textblock
verbosity           normal | brief | concise | verbose | full | max
uniquePromptWords   unique words in the prompt
seedWords           seed words after stopword pruning
articlesRequested   seed words we looked up
articlesFound       articles that existed
wordsDiscovered     unique candidate words before the cap
commonWordsPruned   words dropped by the stopword filter
cap                 the computed word cap (see 2#)
returned            words actually returned
elapsedMs           wall-clock time
```
❓ Anything to add/remove? "Other stats helpful to improve performance" — timing
per stage (fetch vs process)? article titles fetched? cache hits (future)?

### 1d. Concrete schema + sort order

```json
{
  "metadata": { ...above... },
  "data": [
    { "word": "physics", "distance": 0.0,  "score": 0.0,  "seed": true },
    { "word": "energy",   "distance": 0.18, "score": 4.21 }
  ]
}
```
❓ Sort `data` by distance ascending (closest first) or by score descending
(most important first)? I lean distance ascending.

### 1e. GUI

"Score shown in the gui." Plan: render each word as a tag whose **size** scales
with score (or 1−distance), with a tooltip showing both numbers, and a small
metadata summary line ("found 412 → pruned 138 → 30 shown"). 
❓ Size by **score** or by **distance**? Color-code by distance too?

## 2# — Word cap via verbosity prefixes

Grammar becomes:
```
[<modifier>, ]Give me a wordcloud for: <textblock>
modifier ∈ { "Max <N>", "Very brief", "Concisely", (none), "Verbosely", "Full" }
```
Multiplier-based cap (b–f):
```
CAP = Normal(config) × X × uniquePromptWords
X:  brief .25 | concise .5 | normal 1 | verbose 2 | full 10
```
"Max N" (a) = **hard absolute** cap of N (ignores the formula).

Open questions:

- ❓ **2a. uniquePromptWords — include stopwords?** Your example "What is
  physics." → Unique = 3 counts *what / is / physics*, i.e. it counts raw tokens
  **before** stopword pruning (and seemingly with no min-length, since "is" is 2
  chars). Confirm: count raw unique tokens, no stopword/length filtering? (That's
  what the example implies — I'll go with it unless you say otherwise.)
- ❓ **2b. "Normal" value + name.** Example uses Normal = 10. This replaces the
  current `maxWords: 50`. New config key — `wordsPerPromptWord: 10`? Default 10?
- ❓ **2c. Safety ceiling.** "Full" (X=10) on a 40-word prompt → 4000-word cap.
  Want an absolute `maxWordsHardLimit` in config (e.g. 1000) so the multiplier
  path can't blow up? "Max N" would still be honored as-is.
- ❓ **2d. Parsing.** Case-insensitive match of the prefix? Exact phrases as
  written? For "Max N", N is a required integer ("Max 25, give me a wordcloud
  for: ...")? What if the modifier is missing/garbled → fall back to normal?
- ❓ **2e. Seed words vs the cap.** Seeds are always included first — they count
  against the cap. If a prompt has more unique seed words than the cap (only with
  a tiny X), do seeds still all get included (overflowing the cap) or get
  truncated? I lean: seeds always included, cap applies to the *added* words.
- **2f. maxLookups is unaffected** — it bounds how many seed words we fetch
  articles for; the cap only bounds *output* size. (Just confirming, no change.)

## Suggested build order (once decided)

1. Verbosity parsing + dynamic cap (2#) — pure, easy to test.
2. Distance + tf-idf scoring in the pipeline (1a, 1b) — extend trainer for T2.
3. New `{ metadata, data }` response envelope (1c, 1d).
4. GUI update (1e).

---

# DECISIONS LOCKED — 2026-05-31

Answered in chat; this section is the implementation contract. Where it differs
from the discussion above, this section wins.

## Distance — graph hop-count (overrides 1a)

Distance is **not** a frequency metric. It is the **number of link hops** from a
seed word's article to where the word was found, normalized to `[0, 1]`:

- Seed words (the input's own words) → `hops = 0`.
- A word found **on a seed's own article** → `hops = 1`.
- A word found only on a **related (linked) article** → `hops = 2`, and so on.
- Normalize: **`distance = hops / crawl.maxDepth`**. Greater hop-count → closer
  to 1.

We do **not** page-hop yet — the pipeline only reads the seed articles (hop 1).
So with `crawl.maxDepth = 1` (the default), every harvested article word has
`distance = 1.0` and seeds have `distance = 0.0`. The field and pipeline are
structured so multi-hop crawling can be added later without a contract change.

## tf-idf score — T2, reuse the trainer

- `train.mjs` additionally writes **`data/idf-model.json`**:
  `{ generatedAt, documentCount, defaultIdf, idf: { word: idfValue } }`.
- `defaultIdf = ln(documentCount)` (an unseen word is treated as maximally rare,
  so distinctive new words score high).
- Per request: **`score = requestFreq(word) × idf(word)`**, where
  `requestFreq` counts the word across the prompt **and** all fetched articles,
  and `idf` comes from the model (or `defaultIdf` if unseen).
- If no model file exists yet, `idf = 1` for all words → `score = requestFreq`
  (graceful pre-training fallback).
- Score is computed for **every** word, seeds included (this overrides the
  placeholder `score: 0.0` shown for seeds in the 1d sketch).

## Word cap — verbosity prefixes (resolves 2a–2f)

Grammar (prefix is case-insensitive; missing/garbled prefix → `normal`):

```
[<modifier>, ]give me a wordcloud for: <textblock>
modifier ∈ { "Max <N>", "Very brief", "Concisely", (none), "Verbosely", "Full" }
verbosity:   max     | brief | concise | normal | verbose | full
X:           (abs N) | .25   | .5      | 1      | 2       | 10
```

- **`uniquePromptWords`** = raw unique tokens, **no** stopword filter and **no**
  min-length filter (so "What is physics." → 3). (2a confirmed.)
- **`cap = round(wordsPerPromptWord × X × uniquePromptWords)`** — `cap` is the
  **total** cloud size. (2b: new config key `wordsPerPromptWord`, default 10,
  replaces `maxWords`.)
- **`Max N`** = hard absolute cap of `N`, honored as-is (ignores the formula and
  the safety ceiling).
- **Safety ceiling** (2c): the multiplier path is clamped to
  `maxWordsHardLimit` (config, default 1000). `Max N` is exempt.
- **Seeds always kept**: all (post-stopword) seed words are always included,
  even if they alone exceed `cap`; article words then fill up to `cap`. Seeds
  are never silently truncated. Stopword-like tokens ("it", "they") never become
  seeds because the stopword filter removes them first. (2e + chat answer.)
- `maxLookups` is unchanged — it bounds article fetches, not output size (2f).

## Response envelope (1c/1d)

```jsonc
{
  "metadata": {
    "input", "verbosity", "multiplier", "uniquePromptWords", "seedWords",
    "articlesRequested", "articlesFound", "wordsDiscovered",
    "commonWordsPruned", "cap", "returned", "elapsedMs", "fetchMs", "processMs"
  },
  "data": [ { "word", "distance", "score", "seed" }, ... ]
}
```

- `data` sorted by **score descending**, ties broken alphabetically (distance is
  currently uniform, so score is the useful sort key). (Resolves 1d.)
- The assistant message `content` is the **stringified** `{ metadata, data }`
  object. This breaks the old bare-array contract — intended.

## GUI (1e)

- Render each word as a tag whose **font-size scales with score**.
- Tooltip shows both `score` and `distance`.
- Seed words visually distinguished (accent style).
- A summary line from metadata: e.g. "discovered 412 → pruned 138 → 30 shown
  (verbosity: normal, cap 30)".

## New / changed config keys

```
wordsPerPromptWord  10     (replaces maxWords)
maxWordsHardLimit   1000   (ceiling for the multiplier path)
crawl.maxDepth      1      (hop depth; distance normalizer)
training.idfOutputPath  data/idf-model.json
```


