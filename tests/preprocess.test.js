'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, chunkText, preprocessTranscript } = require('../n8n/lib/preprocess');

describe('preprocessTranscript', () => {
  it('strips fillers, service tags and recording notices', () => {
    const cleaned = cleanText('Um, this meeting is being recorded. [inaudible] We need, you know, SSO.');
    assert.equal(cleaned.includes('um'), false);
    assert.equal(cleaned.includes('inaudible'), false);
    assert.match(cleaned, /SSO/i);
  });

  it('chunks a long transcript and preserves speaker lines', () => {
    const utterances = [];
    for (let i = 0; i < 40; i += 1) {
      utterances.push({ speaker_id: `S${i % 2}`, start: i, end: i + 1, text: `Decision point ${i} ${'word '.repeat(20)}` });
    }
    const result = preprocessTranscript({ utterances }, { maxChars: 400 });
    assert.ok(result.chunks.length > 1);
    assert.equal(result.chunks[0].chunk_index, 0);
    assert.equal(result.chunks[0].chunk_total, result.chunks.length);
    assert.match(result.cleaned_text, /S0:/);
  });

  it('returns a single chunk for short text', () => {
    const result = preprocessTranscript({ text: 'Short meeting.' });
    assert.equal(result.chunks.length, 1);
    assert.equal(result.too_short, true);
  });
});

describe('chunkText', () => {
  it('returns empty array for blank input', () => {
    assert.deepEqual(chunkText('   '), []);
  });
});
