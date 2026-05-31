// Browser UI: send the wordcloud prompt (with verbosity modifier) to the
// OpenAI-compatible endpoint and render the { metadata, data } envelope as tags
// sized by tf-idf score, with a metadata summary line.

const form = document.getElementById('form');
const textEl = document.getElementById('text');
const submitEl = document.getElementById('submit');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const cloudEl = document.getElementById('cloud');
const summaryEl = document.getElementById('summary');
const verbosityEl = document.getElementById('verbosity');
const maxnEl = document.getElementById('maxn');

// The "Max N" option reveals the N input.
verbosityEl.addEventListener('change', () => {
  maxnEl.hidden = verbosityEl.value !== 'max';
});

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

// Build the prompt prefix for the chosen verbosity.
function prefixFor() {
  switch (verbosityEl.value) {
    case 'brief': return 'Very brief, ';
    case 'concise': return 'Concisely, ';
    case 'verbose': return 'Verbosely, ';
    case 'full': return 'Full, ';
    case 'max': return `Max ${Math.max(1, Number(maxnEl.value) || 1)}, `;
    default: return '';
  }
}

// Map a score onto a font size, scaling relative to the max score in the cloud.
function sizer(maxScore) {
  const MIN = 0.85;
  const MAX = 2.4;
  return (score) => {
    if (!(maxScore > 0)) return `${MIN}rem`;
    const t = Math.sqrt(Math.max(0, score) / maxScore); // sqrt softens the spread
    return `${(MIN + t * (MAX - MIN)).toFixed(2)}rem`;
  };
}

function renderCloud({ metadata, data }) {
  cloudEl.replaceChildren();
  const maxScore = data.reduce((m, d) => Math.max(m, d.score), 0);
  const size = sizer(maxScore);

  for (const { word, score, distance, seed } of data) {
    const span = document.createElement('span');
    span.className = seed ? 'tag seed' : 'tag';
    span.textContent = word;
    span.style.fontSize = size(score);
    span.title = `score ${score.toFixed(2)} · distance ${distance.toFixed(2)}${seed ? ' · seed' : ''}`;
    cloudEl.appendChild(span);
  }

  const m = metadata;
  summaryEl.textContent =
    `discovered ${m.wordsDiscovered} → pruned ${m.commonWordsPruned} common → ${m.returned} shown ` +
    `· verbosity ${m.verbosity} (×${m.multiplier}), cap ${m.cap} ` +
    `· ${m.articlesFound}/${m.articlesRequested} articles · ${m.elapsedMs} ms`;
  resultEl.hidden = false;
}

async function generate(text) {
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'wordcloud-1',
      messages: [{ role: 'user', content: `${prefixFor()}Give me a wordcloud for: ${text}` }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = textEl.value.trim();
  if (!text) return;

  submitEl.disabled = true;
  resultEl.hidden = true;
  setStatus('Building wordcloud (querying Wikipedia)...');

  try {
    const payload = await generate(text);
    renderCloud(payload);
    setStatus(`Done — ${payload.data.length} words.`);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitEl.disabled = false;
  }
});
