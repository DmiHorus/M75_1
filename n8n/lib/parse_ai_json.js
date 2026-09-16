'use strict';

function unwrapOutput(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.output && typeof value.output === 'object') {
    return value.output;
  }
  return value;
}

function parseAiJson(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ok: true, data: unwrapOutput(raw), error: null };
  }

  const text = String(raw ?? '').trim();
  if (!text) {
    return { ok: false, data: null, error: 'empty_response' };
  }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { ok: false, data: null, error: 'no_json_object' };
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return { ok: true, data: unwrapOutput(parsed), error: null };
  } catch (error) {
    return { ok: false, data: null, error: error.message };
  }
}

function emptyExtraction() {
  return {
    requirements: [],
    constraints: [],
    alternatives: [],
    decisions: [],
    open_questions: [],
    risks: [],
  };
}

function ensureExtractionShape(data) {
  const base = emptyExtraction();
  const src = data && typeof data === 'object' ? data : {};
  for (const key of Object.keys(base)) {
    base[key] = Array.isArray(src[key]) ? src[key] : [];
  }
  return base;
}

module.exports = { parseAiJson, unwrapOutput, emptyExtraction, ensureExtractionShape };
