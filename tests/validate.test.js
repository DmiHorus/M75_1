'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateAdr, hasExplicitDecision } = require('../n8n/lib/validate');

const proposedAdr = {
  title: 'ADR: Use Postgres',
  status: 'Proposed',
  context: 'We need a system of record.',
  decision: 'Use PostgreSQL as the primary store.',
  alternatives: ['MongoDB'],
  consequences: { positive: ['ACID'], negative: ['ops cost'] },
  open_questions: [],
  risks: [],
  source_meeting: 'meeting-123',
};

describe('validateAdr', () => {
  it('forces Needs clarification when no explicit decision was extracted', () => {
    const result = validateAdr({
      adr: { ...proposedAdr, status: 'Proposed', decision: 'Use Postgres' },
      aggregated: { decisions: [{ text: 'maybe postgres', explicit: false, status: 'discussed' }] },
    });
    assert.equal(result.adr.status, 'Needs clarification');
    assert.equal(result.needs_clarification, true);
    assert.equal(result.block_publication, false);
    assert.ok(result.issues.some((issue) => issue.code === 'no_explicit_decision'));
  });

  it('does not invent a decision when extraction is empty', () => {
    const result = validateAdr({
      adr: { ...proposedAdr, decision: '' },
      aggregated: { decisions: [] },
    });
    assert.equal(result.adr.status, 'Needs clarification');
    assert.match(result.adr.decision, /No explicit architecture decision/i);
  });

  it('blocks publication on invalid JSON from the AI node', () => {
    const result = validateAdr({ adr: proposedAdr, jsonError: 'Unexpected token' });
    assert.equal(result.ok, false);
    assert.equal(result.block_publication, true);
    assert.equal(result.adr, null);
  });

  it('marks contradictory decisions and keeps the document reviewable', () => {
    const result = validateAdr({
      adr: proposedAdr,
      aggregated: {
        decisions: [{ text: 'use REST', explicit: true }],
        contradictions: [{ type: 'opposing_statements', left_id: 'DEC-1', right_id: 'DEC-2' }],
      },
    });
    assert.equal(result.has_contradictions, true);
    assert.equal(result.block_publication, false);
    assert.equal(result.adr.status, 'Needs clarification');
  });

  it('annotates incomplete Jira/Confluence context instead of failing', () => {
    const result = validateAdr({
      adr: proposedAdr,
      aggregated: { decisions: [{ text: 'Use Postgres', explicit: true, status: 'accepted' }] },
      contextIncomplete: true,
    });
    assert.match(result.adr.context, /INCOMPLETE CONTEXT/);
    assert.ok(result.issues.some((issue) => issue.code === 'incomplete_context'));
    assert.equal(result.block_publication, false);
  });

  it('keeps Proposed when an explicit decision exists and JSON is valid', () => {
    const result = validateAdr({
      adr: proposedAdr,
      aggregated: { decisions: [{ text: 'Use Postgres', explicit: true }] },
    });
    assert.equal(result.adr.status, 'Proposed');
    assert.equal(result.needs_clarification, false);
  });
});

describe('hasExplicitDecision', () => {
  it('ignores discussed-only options', () => {
    assert.equal(hasExplicitDecision({ decisions: [{ text: 'GraphQL?', status: 'discussed' }] }), false);
  });
});
