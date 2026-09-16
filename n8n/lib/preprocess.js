'use strict';

const FILLER_RE = /\b(um+|uh+|erm+|ah+|you know|i mean|kind of|sort of)\b/gi;
const SERVICE_RE = /\[(inaudible|unintelligible|music|laughter|applause|silence|blank_audio)\]/gi;
const RECORDING_NOTICE_RE = /this (meeting|call|conversation) is being recorded\.?/gi;

function cleanText(text) {
  return String(text || '')
    .replace(SERVICE_RE, ' ')
    .replace(RECORDING_NOTICE_RE, ' ')
    .replace(FILLER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatUtterance(utterance) {
  const cleaned = cleanText(utterance.text);
  if (!cleaned) return '';
  const ts =
    utterance.start != null
      ? `[${utterance.start}${utterance.end != null ? `-${utterance.end}` : ''}] `
      : '';
  const speaker = utterance.speaker_id ? `${utterance.speaker_id}: ` : '';
  return `${ts}${speaker}${cleaned}`.trim();
}

function chunkText(text, maxChars = 6000) {
  const source = String(text || '').trim();
  if (!source) return [];
  if (source.length <= maxChars) {
    return [{ chunk_index: 0, text: source, start_offset: 0, end_offset: source.length }];
  }

  const chunks = [];
  let cursor = 0;
  let index = 0;
  while (cursor < source.length) {
    let end = Math.min(cursor + maxChars, source.length);
    if (end < source.length) {
      const window = source.lastIndexOf('\n', end);
      const sentence = source.lastIndexOf('. ', end);
      const splitAt = Math.max(window, sentence);
      if (splitAt > cursor + Math.floor(maxChars * 0.4)) end = splitAt + 1;
    }
    const slice = source.slice(cursor, end).trim();
    if (slice) {
      chunks.push({
        chunk_index: index,
        text: slice,
        start_offset: cursor,
        end_offset: end,
      });
      index += 1;
    }
    cursor = end;
  }
  return chunks;
}

function preprocessTranscript(input, options = {}) {
  const maxChars = options.maxChars || 6000;
  const text = input?.text || '';
  const utterances = Array.isArray(input?.utterances) ? input.utterances : [];
  const lines = utterances.length
    ? utterances.map(formatUtterance).filter(Boolean)
    : [cleanText(text)];
  const cleanedText = lines.join('\n').trim();
  const chunks = chunkText(cleanedText, maxChars).map((chunk, _, all) => ({
    ...chunk,
    chunk_total: all.length,
  }));

  return {
    cleaned_text: cleanedText,
    chunks,
    utterance_count: utterances.length,
    too_short: cleanedText.length < 40,
  };
}

module.exports = { cleanText, chunkText, preprocessTranscript, formatUtterance };
