'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assembleContext } = require('../n8n/lib/assemble_context');
const { buildPublishPayloads } = require('../n8n/lib/format_document');

describe('assembleContext', () => {
  it('continues with a degradation flag when Jira and Confluence fail', () => {
    const ctx = assembleContext({
      meeting: { jira_epic_id: 'ARCH-1', project_id: 'PAY' },
      jiraItem: { error: 'ECONNREFUSED' },
      confluenceItem: { statusCode: 503 },
    });
    assert.equal(ctx.incomplete, true);
    assert.ok(ctx.warnings.includes('jira_unavailable'));
    assert.ok(ctx.warnings.includes('confluence_unavailable'));
    assert.match(ctx.context_text, /INCOMPLETE/);
  });

  it('does not mark incomplete when extra systems were not requested', () => {
    const ctx = assembleContext({
      meeting: { jira_epic_id: '', project_id: '' },
      jiraItem: { error: 'skipped' },
      confluenceItem: { error: 'skipped' },
    });
    assert.equal(ctx.incomplete, false);
  });
});

describe('buildPublishPayloads', () => {
  it('renders every required ADR section', () => {
    const adr = {
      title: 'ADR: Use Postgres',
      status: 'Proposed',
      context: 'Need a SoR',
      decision: 'PostgreSQL',
      alternatives: ['MongoDB'],
      consequences: { positive: ['ACID'], negative: ['ops'] },
      open_questions: ['Sharding?'],
      risks: ['ops load'],
      source_meeting: 'meeting-123',
    };
    const payloads = buildPublishPayloads(adr, { warnings: [] });
    for (const section of ['Context', 'Decision', 'Alternatives', 'Consequences', 'Open Questions', 'Risks', 'Source Meeting']) {
      assert.match(payloads.confluence_storage, new RegExp(section));
    }
    assert.equal(payloads.jira_adf.type, 'doc');
    assert.ok(payloads.notion_children.length > 5);
    assert.match(payloads.slack_mrkdwn, /PostgreSQL/);
  });
});
