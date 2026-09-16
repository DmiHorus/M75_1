'use strict';

function isHttpError(item) {
  if (!item || typeof item !== 'object') return true;
  if (item.error) return true;
  const status = item.statusCode || item.status;
  if (status && Number(status) >= 400) return true;
  return false;
}

function assembleContext({ meeting, jiraItem, confluenceItem }) {
  const warnings = [];
  const jiraRequested = Boolean(meeting?.jira_epic_id);
  const confluenceRequested = Boolean(meeting?.project_id);

  let jira = { issues: [], epic: null, available: false };
  if (jiraRequested && !jiraItem?.jira_skipped) {
    if (isHttpError(jiraItem)) {
      warnings.push('jira_unavailable');
    } else {
      jira = {
        available: true,
        epic: jiraItem.epic || jiraItem.key ? jiraItem : jiraItem.issues ? jiraItem.epic : jiraItem,
        issues: jiraItem.issues || jiraItem.fields ? [jiraItem] : [],
      };
    }
  }

  let confluence = { pages: [], available: false };
  if (confluenceRequested && !confluenceItem?.confluence_skipped) {
    if (isHttpError(confluenceItem)) {
      warnings.push('confluence_unavailable');
    } else {
      const results = confluenceItem.results || confluenceItem.pages || confluenceItem.contents || [];
      confluence = { available: true, pages: results };
    }
  }

  const incomplete = warnings.length > 0;
  const contextText = [
    incomplete ? 'CONTEXT STATUS: INCOMPLETE — generate the ADR anyway and mention missing systems.' : 'CONTEXT STATUS: complete',
    jiraRequested ? `JIRA EPIC: ${meeting.jira_epic_id}` : 'JIRA: not requested',
    jira.available ? `JIRA DATA: ${JSON.stringify(jira).slice(0, 4000)}` : warnings.includes('jira_unavailable') ? 'JIRA DATA: unavailable' : '',
    confluenceRequested ? `CONFLUENCE PROJECT: ${meeting.project_id}` : 'CONFLUENCE: not requested',
    confluence.available ? `CONFLUENCE DATA: ${JSON.stringify(confluence).slice(0, 4000)}` : warnings.includes('confluence_unavailable') ? 'CONFLUENCE DATA: unavailable' : '',
    `OPTIONAL RAG STANDARDS: ${(meeting.architectural_standards || []).join(', ') || 'none (MVP, vector store not required)'}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    jira,
    confluence,
    warnings,
    incomplete,
    context_text: contextText,
    architectural_standards: meeting?.architectural_standards || [],
  };
}

module.exports = { assembleContext, isHttpError };
