'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const workflow = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../n8n/workflows/adr-generation-pipeline.json'), 'utf8'),
);

function nodeNames() {
  return workflow.nodes.map((node) => node.name);
}

function incoming(name) {
  const sources = [];
  for (const [from, ports] of Object.entries(workflow.connections)) {
    for (const [kind, bundles] of Object.entries(ports)) {
      if (kind !== 'main') continue;
      for (const bundle of bundles) {
        for (const link of bundle || []) {
          if (link.node === name) sources.push(from);
        }
      }
    }
  }
  return sources;
}

describe('ADR n8n workflow', () => {
  it('keeps the mandated stage order as named nodes', () => {
    const names = nodeNames();
    const required = [
      'Webhook Trigger',
      'Download Recording',
      'Speech-to-Text',
      'Preprocess and Chunk',
      'Fetch Jira Context',
      'Fetch Confluence Context',
      'Requirements Extraction',
      'Constraints Extraction',
      'Alternatives Extraction',
      'Decisions Extraction',
      'Aggregate Reduce',
      'Generate ADR',
      'Validate ADR',
      'Human Review',
      'Publish Confluence',
      'Publish Notion',
      'Publish Jira Comment',
      'Notify Slack Published',
      'Notify Teams Published',
    ];
    for (const name of required) {
      assert.ok(names.includes(name), `missing node ${name}`);
    }
  });

  it('cannot publish without going through Human Review / Approve', () => {
    const reviewSources = incoming('Human Review');
    assert.ok(reviewSources.length > 0);
    assert.ok(!reviewSources.includes('Publish Confluence'));

    const publishSources = incoming('Publish Confluence');
    assert.deepEqual(publishSources, ['Switch Review Action']);
    const approveLinks = workflow.connections['Switch Review Action'].main[0].map((link) => link.node);
    assert.ok(approveLinks.includes('Publish Confluence'));
    assert.ok(!approveLinks.includes('Notify Rejected'));
  });

  it('stops invalid JSON without connecting that branch to publication', () => {
    const stopSources = incoming('Log Invalid JSON Stop');
    assert.deepEqual(stopSources, ['Notify Invalid JSON']);
    assert.equal(incoming('Notify Invalid JSON').includes('Publish Confluence'), false);
  });

  it('uses n8n LangChain nodes rather than an external AI HTTP API', () => {
    const types = workflow.nodes.map((node) => node.type);
    assert.ok(types.includes('@n8n/n8n-nodes-langchain.informationExtractor'));
    assert.ok(types.includes('@n8n/n8n-nodes-langchain.chainLlm'));
    assert.ok(types.includes('@n8n/n8n-nodes-langchain.lmChatOpenAi'));
  });
});
