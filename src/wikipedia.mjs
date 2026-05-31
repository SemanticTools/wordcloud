// Client for the MediaWiki Action API. Given a list of candidate words/titles,
// it fetches the full plain-text extract of any that has a Wikipedia article.
//
// Note: the TextExtracts API caps `exlimit` to 1 for *whole-article* extracts
// ("\"exlimit\" was too large for a whole article extracts request"), so titles
// cannot be batched — each full extract needs its own request. We therefore
// fetch one title per request and bound how many run concurrently.
//
// Exposed as a factory so callers (and tests) can inject a fake implementation
// instead of hitting the network.

// Run `fn` over `items` with at most `limit` concurrent invocations,
// preserving input order in the results array.
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

export function createWikipediaClient(config = {}) {
  const {
    apiUrl = 'https://en.wikipedia.org/w/api.php',
    userAgent = 'wordcloud-server/1.0',
    concurrency = 8,
    timeoutMs = 10000,
  } = config;

  // Fetch the full plain-text extract for a single title. Returns
  // { title, extract } if the article exists with content, else null.
  // Network/parse errors are swallowed (logged) so one bad title can't sink
  // the whole request.
  async function fetchOne(title) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      explaintext: '1',
      redirects: '1',
      format: 'json',
      formatversion: '2',
      titles: title,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${apiUrl}?${params}`, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const page = data?.query?.pages?.[0];
      if (!page || page.missing || typeof page.extract !== 'string' || page.extract.length === 0) {
        return null;
      }
      return { title: page.title, extract: page.extract };
    } catch (err) {
      console.error(`[wikipedia] fetch failed for "${title}": ${err.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Fetch full articles for all `words`, one request each, bounded by
  // `concurrency`. Returns { title, extract } for existing pages only.
  async function fetchArticles(words) {
    if (!Array.isArray(words) || words.length === 0) return [];
    const results = await mapPool(words, concurrency, fetchOne);
    return results.filter(Boolean);
  }

  return { fetchArticles };
}
