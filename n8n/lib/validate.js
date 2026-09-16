'use strict';

const REQUIRED_ADR_KEYS = [
  'title',
  'status',
  'context',
  'decision',
  'alternatives',
  'consequences',
  'open_questions',
  'risks',
  'source_meeting',
];

function hasExplicitDecision(aggregated) {
  const decisions = aggregated?.decisions || [];
  return decisions.some((decision) => {
    const text = String(decision?.text || decision?.decision || '').trim();
    if (!text) return false;
    if (decision.explicit === false) return false;
    const status = String(decision.status || '').toLowerCase();
    if (['discussed', 'proposed', 'deferred', 'rejected'].includes(status)) return false;
    if (decision.explicit === true) return true;
    if (['accepted', 'decided', 'approved', 'chosen'].includes(status)) return true;
    return false;
  });
}

function missingSections(adr) {
  const missing = [];
  for (const key of REQUIRED_ADR_KEYS) {
    if (adr[key] == null || adr[key] === '') missing.push(key);
  }
  if (!adr?.consequences || typeof adr.consequences !== 'object') {
    if (!missing.includes('consequences')) missing.push('consequences');
  }
  return missing;
}

function validateAdr({ adr, aggregated = {}, jsonError = null, contextIncomplete = false }) {
  if (jsonError) {
    return {
      ok: false,
      block_publication: true,
      needs_clarification: false,
      has_contradictions: false,
      status: 'invalid_json',
      issues: [{ code: 'invalid_json', message: String(jsonError) }],
      adr: null,
    };
  }

  const result = {
    title: adr?.title || 'ADR: Untitled',
    status: adr?.status || 'Proposed',
    context: adr?.context || '',
    decision: adr?.decision || '',
    alternatives: Array.isArray(adr?.alternatives) ? adr.alternatives : [],
    consequences: {
      positive: Array.isArray(adr?.consequences?.positive) ? adr.consequences.positive : [],
      negative: Array.isArray(adr?.consequences?.negative) ? adr.consequences.negative : [],
    },
    open_questions: Array.isArray(adr?.open_questions) ? adr.open_questions : aggregated.open_questions || [],
    risks: Array.isArray(adr?.risks) ? adr.risks : aggregated.risks || [],
    source_meeting: adr?.source_meeting || aggregated.source_meeting || '',
  };

  const issues = [];
  const explicit = hasExplicitDecision(aggregated);
  const contradictions = aggregated.contradictions || [];

  if (!explicit) {
    result.status = 'Needs clarification';
    if (!String(result.decision).trim()) {
      result.decision =
        'No explicit architecture decision was recorded in the source meeting. Clarification is required before this ADR can be accepted.';
    }
    issues.push({
      code: 'no_explicit_decision',
      message: 'Transcript did not contain an explicitly accepted decision. Status forced to Needs clarification.',
    });
  }

  if (!String(result.context).trim()) {
    issues.push({ code: 'missing_context', message: 'ADR context is empty.' });
    result.status = 'Needs clarification';
  }

  if (!String(result.decision).trim()) {
    issues.push({ code: 'missing_decision', message: 'ADR decision field is empty.' });
    result.status = 'Needs clarification';
  }

  if (contradictions.length) {
    issues.push({
      code: 'contradictory_decisions',
      message: 'Aggregated extraction contains contradictory decisions.',
      items: contradictions,
    });
    if (result.status === 'Proposed') result.status = 'Needs clarification';
  }

  if (contextIncomplete) {
    issues.push({
      code: 'incomplete_context',
      message: 'Jira/Confluence context was unavailable or partial. ADR generated with degraded context.',
    });
    if (!/incomplete context/i.test(result.context)) {
      result.context = `[INCOMPLETE CONTEXT] ${result.context}`.trim();
    }
  }

  const missing = missingSections(result);
  if (missing.length) {
    issues.push({ code: 'missing_sections', message: `Missing ADR sections: ${missing.join(', ')}`, items: missing });
  }

  return {
    ok: !issues.some((issue) => issue.code === 'invalid_json'),
    block_publication: false,
    needs_clarification: result.status === 'Needs clarification',
    has_contradictions: contradictions.length > 0,
    issues,
    adr: result,
  };
}

module.exports = {
  REQUIRED_ADR_KEYS,
  hasExplicitDecision,
  missingSections,
  validateAdr,
};
