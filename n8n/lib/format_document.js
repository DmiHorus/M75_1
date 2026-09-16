'use strict';

function asList(items) {
  return (items || []).map((item) => {
    if (typeof item === 'string') return item;
    return item.text || item.title || JSON.stringify(item);
  });
}

function htmlList(items) {
  const values = asList(items);
  if (!values.length) return '<p><em>None</em></p>';
  return `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatConfluenceStorage(adr, extras = {}) {
  const warnings = extras.warnings || [];
  const warningHtml = warnings.length
    ? `<ac:structured-macro ac:name="warning"><ac:rich-text-body><p>${escapeHtml(warnings.join(' '))}</p></ac:rich-text-body></ac:structured-macro>`
    : '';
  return `${warningHtml}
<h1>${escapeHtml(adr.title)}</h1>
<p><strong>Status:</strong> ${escapeHtml(adr.status)}</p>
<h2>Context</h2>
<p>${escapeHtml(adr.context)}</p>
<h2>Decision</h2>
<p>${escapeHtml(adr.decision)}</p>
<h2>Alternatives</h2>
${htmlList(adr.alternatives)}
<h2>Consequences</h2>
<h3>Positive</h3>
${htmlList(adr.consequences?.positive)}
<h3>Negative</h3>
${htmlList(adr.consequences?.negative)}
<h2>Open Questions</h2>
${htmlList(adr.open_questions)}
<h2>Risks</h2>
${htmlList(adr.risks)}
<h2>Source Meeting</h2>
<p>${escapeHtml(adr.source_meeting)}</p>`;
}

function formatNotionChildren(adr) {
  const heading = (text) => ({
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
  });
  const paragraph = (text) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: String(text || '').slice(0, 1900) } }] },
  });
  const bullets = (items) =>
    asList(items).map((item) => ({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: String(item).slice(0, 1900) } }] },
    }));

  return [
    paragraph(`Status: ${adr.status}`),
    heading('Context'),
    paragraph(adr.context),
    heading('Decision'),
    paragraph(adr.decision),
    heading('Alternatives'),
    ...(bullets(adr.alternatives).length ? bullets(adr.alternatives) : [paragraph('None')]),
    heading('Consequences'),
    paragraph('Positive'),
    ...bullets(adr.consequences?.positive),
    paragraph('Negative'),
    ...bullets(adr.consequences?.negative),
    heading('Open Questions'),
    ...(bullets(adr.open_questions).length ? bullets(adr.open_questions) : [paragraph('None')]),
    heading('Risks'),
    ...(bullets(adr.risks).length ? bullets(adr.risks) : [paragraph('None')]),
    heading('Source Meeting'),
    paragraph(adr.source_meeting),
  ];
}

function formatSlackMrkdwn(adr, extras = {}) {
  const reviewUrl = extras.reviewUrl ? `\nReview form: ${extras.reviewUrl}` : '';
  const warnings = extras.warnings?.length ? `\n:warning: ${extras.warnings.join(' | ')}` : '';
  return `*${adr.title}*\nStatus: \`${adr.status}\`${warnings}\n\n*Context*\n${adr.context}\n\n*Decision*\n${adr.decision}\n\n*Source*: ${adr.source_meeting}${reviewUrl}`;
}

function formatJiraAdf(adr, extras = {}) {
  const textBlock = (text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: String(text || '—') }],
  });
  const heading = (text) => ({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text }],
  });
  const bullets = (items) => ({
    type: 'bulletList',
    content: asList(items).map((item) => ({
      type: 'listItem',
      content: [textBlock(item)],
    })),
  });
  const warnings = extras.warnings?.length ? [textBlock(`Warnings: ${extras.warnings.join(' | ')}`)] : [];
  return {
    type: 'doc',
    version: 1,
    content: [
      ...warnings,
      textBlock(`${adr.title} [${adr.status}]`),
      heading('Context'),
      textBlock(adr.context),
      heading('Decision'),
      textBlock(adr.decision),
      heading('Alternatives'),
      asList(adr.alternatives).length ? bullets(adr.alternatives) : textBlock('None'),
      heading('Consequences — Positive'),
      asList(adr.consequences?.positive).length ? bullets(adr.consequences.positive) : textBlock('None'),
      heading('Consequences — Negative'),
      asList(adr.consequences?.negative).length ? bullets(adr.consequences.negative) : textBlock('None'),
      heading('Open Questions'),
      asList(adr.open_questions).length ? bullets(adr.open_questions) : textBlock('None'),
      heading('Risks'),
      asList(adr.risks).length ? bullets(adr.risks) : textBlock('None'),
      heading('Source Meeting'),
      textBlock(adr.source_meeting),
    ],
  };
}

function buildPublishPayloads(adr, extras = {}) {
  return {
    confluence_storage: formatConfluenceStorage(adr, extras),
    notion_children: formatNotionChildren(adr),
    slack_mrkdwn: formatSlackMrkdwn(adr, extras),
    jira_adf: formatJiraAdf(adr, extras),
    title: adr.title,
    status: adr.status,
  };
}

module.exports = {
  formatConfluenceStorage,
  formatNotionChildren,
  formatSlackMrkdwn,
  formatJiraAdf,
  buildPublishPayloads,
};
