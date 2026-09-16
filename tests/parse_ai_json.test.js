'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAiJson, ensureExtractionShape } = require('../n8n/lib/parse_ai_json');

describe('parseAiJson', () => {
  it('accepts a raw object and unwraps {output}', () => {
    const parsed = parseAiJson({ output: { title: 'ADR: X', status: 'Proposed' } });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.title, 'ADR: X');
  });

  it('extracts JSON from markdown fences', () => {
    const parsed = parseAiJson('Here you go:\n```json\n{"title":"ADR: Y","status":"Proposed"}\n```');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.title, 'ADR: Y');
  });

  it('fails closed on invalid JSON instead of throwing', () => {
    const parsed = parseAiJson('{"title":');
    assert.equal(parsed.ok, false);
    assert.equal(parsed.data, null);
    assert.ok(parsed.error);
  });

  it('returns empty extraction shape when AI omitted arrays', () => {
    const shaped = ensureExtractionShape({ requirements: [{ text: 'SSO' }] });
    assert.equal(shaped.requirements.length, 1);
    assert.deepEqual(shaped.decisions, []);
    assert.deepEqual(shaped.risks, []);
  });
});
