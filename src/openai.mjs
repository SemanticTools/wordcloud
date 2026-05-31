// Helpers for speaking the OpenAI Chat Completions wire format: parsing the
// fixed wordcloud prompt out of a request, and building success/error envelopes.

import { parseModifier } from './verbosity.mjs';

// Thrown when a request doesn't conform to what we expect. `status` maps to an
// HTTP status code; `type`/`code` populate the OpenAI error body.
export class RequestError extends Error {
  constructor(message, { status = 400, type = 'invalid_request_error', code = null } = {}) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

// Matches the fixed prompt format, with an optional verbosity modifier:
//   [<modifier>, ]give me a wordcloud for: <textblock>
// case-insensitively. Group 1 = optional modifier, group 2 = textblock.
const PROMPT_RE = /^\s*(?:(.*?),\s*)?give me a wordcloud for:\s*([\s\S]+)$/i;

// Parse the latest user message into { textblock, verbosity, maxN }. Throws
// RequestError if the request is malformed or the prompt doesn't match. An
// unrecognised modifier is tolerated and falls back to normal verbosity.
export function parsePrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new RequestError('Request must include a non-empty "messages" array.');
  }

  const lastUser = [...messages].reverse().find((m) => m && m.role === 'user');
  if (!lastUser || typeof lastUser.content !== 'string') {
    throw new RequestError('No user message with string content was found.');
  }

  const match = lastUser.content.match(PROMPT_RE);
  if (!match) {
    throw new RequestError(
      'Prompt must use the format: "[<modifier>, ]Give me a wordcloud for: <text>".',
    );
  }

  const textblock = match[2].trim();
  if (textblock.length === 0) {
    throw new RequestError('The text to build a wordcloud from is empty.');
  }

  const { verbosity, maxN } = parseModifier(match[1]) ?? { verbosity: 'normal', maxN: null };
  return { textblock, verbosity, maxN };
}

// Very rough token estimate (~4 chars/token) for the usage block. Good enough
// for a non-billing, OpenAI-shaped response.
function estimateTokens(text) {
  return Math.max(1, Math.ceil((text?.length ?? 0) / 4));
}

// Build an OpenAI `chat.completion` response whose assistant message content is
// the stringified `payload` ({ metadata, data } per REFINE).
export function buildCompletion({ model, payload, created, promptText = '' }) {
  const content = JSON.stringify(payload);
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(content);
  return {
    id: `chatcmpl-${created.toString(36)}`,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

// Build an OpenAI-shaped error body.
export function buildError(message, { type = 'invalid_request_error', code = null } = {}) {
  return { error: { message, type, code, param: null } };
}

// Build an OpenAI `/v1/models` list payload advertising the given model id.
export function buildModelList(model, created) {
  return {
    object: 'list',
    data: [
      { id: model, object: 'model', created, owned_by: 'wordcloud-server' },
    ],
  };
}
