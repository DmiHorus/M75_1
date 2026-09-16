'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseSttResponse, utterancesFromPlainTranscript } = require('../n8n/lib/parse_stt');

describe('parseSttResponse', () => {
  it('keeps speaker_id and timestamps from Whisper verbose_json segments', () => {
    const parsed = parseSttResponse(
      {
        text: 'Hello world',
        language: 'en',
        segments: [
          { start: 0.0, end: 1.2, text: 'Hello', speaker: 'spk_0' },
          { start: 1.2, end: 2.0, text: 'world', speaker: 'spk_1' },
        ],
      },
      [{ id: 'Ada' }, { id: 'Bob' }],
    );
    assert.equal(parsed.utterances[0].speaker_id, 'spk_0');
    assert.equal(parsed.utterances[0].start, 0);
    assert.equal(parsed.utterances[1].speaker_id, 'spk_1');
  });

  it('falls back to participant ids when diarization is missing', () => {
    const parsed = parseSttResponse(
      { segments: [{ start: 0, end: 1, text: 'Hi' }] },
      [{ id: 'Ada' }],
    );
    assert.equal(parsed.utterances[0].speaker_id, 'Ada');
  });
});

describe('utterancesFromPlainTranscript', () => {
  it('splits speaker-tagged lines', () => {
    const parsed = utterancesFromPlainTranscript('Ada: hello\nBob: we decided on REST');
    assert.equal(parsed.utterances[0].speaker_id, 'Ada');
    assert.equal(parsed.utterances[1].text, 'we decided on REST');
  });
});
