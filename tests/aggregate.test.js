'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateExtractions } = require('../n8n/lib/aggregate');

describe('aggregateExtractions', () => {
  it('deduplicates matching requirements across chunks', () => {
    const aggregated = aggregateExtractions([
      { chunk_index: 0, requirements: [{ text: 'The system must support SSO via SAML' }] },
      { chunk_index: 1, requirements: [{ text: 'The system must support SSO via SAML for all users' }, { text: 'Audit logging is required' }] },
    ]);
    assert.equal(aggregated.requirements.length, 2);
    assert.ok(aggregated.requirements[0].sources.includes(0));
  });

  it('matches alternatives to decisions by id', () => {
    const aggregated = aggregateExtractions([
      {
        alternatives: [{ id: 'ALT-REST', title: 'REST API' }, { id: 'ALT-GQL', title: 'GraphQL' }],
        decisions: [{ id: 'DEC-1', text: 'Use REST', explicit: true, chosen_alternative_id: 'ALT-REST' }],
      },
    ]);
    assert.equal(aggregated.decisions[0].matched_alternative, 'ALT-REST');
  });

  it('detects contradictory accepted decisions', () => {
    const aggregated = aggregateExtractions([
      {
        decisions: [
          { text: 'We decided to use REST for the public API', explicit: true },
          { text: 'We decided to use GraphQL for the public API', explicit: true },
        ],
      },
    ]);
    assert.ok(aggregated.contradictions.length >= 1);
  });
});
