'use strict';

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemText(item) {
  if (!item || typeof item === 'string') return String(item || '');
  return item.text || item.title || item.description || item.decision || '';
}

function itemId(item, prefix, index) {
  return item?.id || `${prefix}-${index + 1}`;
}

function similar(a, b) {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length > 24 && right.includes(left)) return true;
  if (right.length > 24 && left.includes(right)) return true;
  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 3));
  const rightTokens = new Set(right.split(' ').filter((token) => token.length > 3));
  if (!leftTokens.size || !rightTokens.size) return false;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.min(leftTokens.size, rightTokens.size);
  return ratio >= 0.72 && overlap >= 3;
}

function dedupe(items, prefix) {
  const result = [];
  for (const item of items || []) {
    const text = itemText(item);
    if (!text.trim()) continue;
    const existing = result.find((candidate) => similar(itemText(candidate), text));
    if (!existing) {
      result.push({
        ...(typeof item === 'object' ? item : { text: item }),
        id: itemId(item, prefix, result.length),
        text: text.trim(),
        sources: [item?.chunk_index].filter((value) => value != null),
      });
      continue;
    }
    existing.sources = Array.from(new Set([...(existing.sources || []), item?.chunk_index].filter((value) => value != null)));
    if ((item.priority === 'must' || item.explicit === true) && existing.priority !== 'must') {
      Object.assign(existing, item, { id: existing.id, text: existing.text, sources: existing.sources });
    }
  }
  return result;
}

function negationConflict(a, b) {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  const pair = [left, right];
  const hasNeg = (text) => /\b(not|no|don't|do not|reject|avoid|against|не|нет)\b/.test(text);
  if (hasNeg(left) !== hasNeg(right) && similar(left.replace(/\b(not|no|don't|do not|reject|avoid|against|не|нет)\b/g, ''), right.replace(/\b(not|no|don't|do not|reject|avoid|against|не|нет)\b/g, ''))) {
    return true;
  }
  const tech = ['graphql', 'rest', 'grpc', 'kafka', 'rabbitmq', 'postgres', 'mongodb', 'mysql', 'kubernetes', 'ecs', 'lambda'];
  const chosen = (text) => tech.filter((token) => text.includes(token));
  const leftTech = chosen(left);
  const rightTech = chosen(right);
  if (leftTech.length && rightTech.length && leftTech.some((token) => !rightTech.includes(token)) && rightTech.some((token) => !leftTech.includes(token))) {
    if (/\b(use|adopt|choose|go with|выбра|принима)\b/.test(left) && /\b(use|adopt|choose|go with|выбра|принима)\b/.test(right)) {
      return true;
    }
  }
  return pair.length === 2 && false;
}

function detectContradictions(decisions) {
  const contradictions = [];
  for (let i = 0; i < decisions.length; i += 1) {
    for (let j = i + 1; j < decisions.length; j += 1) {
      const left = decisions[i];
      const right = decisions[j];
      if (left.chosen_alternative_id && right.chosen_alternative_id && left.chosen_alternative_id !== right.chosen_alternative_id) {
        contradictions.push({
          type: 'alternative_mismatch',
          left_id: left.id,
          right_id: right.id,
          message: `Decisions ${left.id} and ${right.id} choose different alternatives`,
        });
        continue;
      }
      if (negationConflict(itemText(left), itemText(right))) {
        contradictions.push({
          type: 'opposing_statements',
          left_id: left.id,
          right_id: right.id,
          message: `Decisions ${left.id} and ${right.id} appear to contradict each other`,
        });
      }
    }
  }
  return contradictions;
}

function matchAlternativesToDecisions(alternatives, decisions) {
  return decisions.map((decision) => {
    const byId = alternatives.find((alt) => alt.id && alt.id === decision.chosen_alternative_id);
    if (byId) {
      return { ...decision, matched_alternative: byId.id };
    }
    const byText = alternatives.find((alt) => similar(itemText(alt), itemText(decision)) || similar(alt.title, itemText(decision)));
    return { ...decision, matched_alternative: byText?.id || decision.chosen_alternative_id || null };
  });
}

function collectFromChunks(chunkResults) {
  const buckets = {
    requirements: [],
    constraints: [],
    alternatives: [],
    decisions: [],
    open_questions: [],
    risks: [],
  };
  for (const chunk of chunkResults || []) {
    const data = chunk.data || chunk.output || chunk;
    const chunkIndex = chunk.chunk_index ?? data.chunk_index;
    for (const key of Object.keys(buckets)) {
      for (const item of data[key] || []) {
        buckets[key].push({
          ...(typeof item === 'object' ? item : { text: item }),
          chunk_index: chunkIndex,
        });
      }
    }
  }
  return buckets;
}

function aggregateExtractions(chunkResults) {
  const collected = collectFromChunks(chunkResults);
  const requirements = dedupe(collected.requirements, 'REQ');
  const constraints = dedupe(collected.constraints, 'CON');
  const alternatives = dedupe(collected.alternatives, 'ALT');
  const openQuestions = dedupe(collected.open_questions, 'Q');
  const risks = dedupe(collected.risks, 'RISK');
  const decisions = matchAlternativesToDecisions(alternatives, dedupe(collected.decisions, 'DEC'));
  const contradictions = detectContradictions(decisions);

  return {
    requirements,
    constraints,
    alternatives,
    decisions,
    open_questions: openQuestions,
    risks,
    contradictions,
    chunk_count: (chunkResults || []).length,
  };
}

module.exports = {
  normalizeKey,
  similar,
  dedupe,
  detectContradictions,
  matchAlternativesToDecisions,
  aggregateExtractions,
};
