'use strict';

const EXTRACTION_INTERMEDIATE_SHAPE = `{
  "requirements": [],
  "constraints": [],
  "alternatives": [],
  "decisions": [],
  "open_questions": [],
  "risks": []
}`;

const ADR_JSON_SHAPE = `{
  "title": "ADR: <краткое описание решения>",
  "status": "Proposed",
  "context": "...",
  "decision": "...",
  "alternatives": [],
  "consequences": {
    "positive": [],
    "negative": []
  },
  "open_questions": [],
  "risks": [],
  "source_meeting": "meeting-123"
}`;

const REQUIREMENTS_PROMPT = `You are an architecture analyst extracting REQUIREMENTS only from a customer meeting transcript chunk.
Do not extract decisions, alternatives, or constraints unless they are clearly requirements.
A requirement is a capability, quality attribute, or business need that the system must/should satisfy.
Return JSON with a "requirements" array. Each item: id, text, priority (must|should|could), source_quote, speaker_id.
If none, return {"requirements": []}.
Never invent requirements that were not discussed.`;

const CONSTRAINTS_PROMPT = `You are an architecture analyst extracting CONSTRAINTS only from a customer meeting transcript chunk.
Constraints are hard limits: budget, timeline, tech stack mandates, compliance, team size, existing systems that cannot be replaced.
Do not mix them with optional alternatives or accepted decisions.
Return JSON with a "constraints" array. Each item: id, text, type (technical|business|regulatory|time), source_quote.
If none, return {"constraints": []}.`;

const ALTERNATIVES_PROMPT = `You are an architecture analyst extracting ALTERNATIVES only from a customer meeting transcript chunk.
Capture options that were discussed, compared, deferred, or rejected — not the final accepted decision.
Return JSON with an "alternatives" array. Each item: id, title, description, pros, cons, status (discussed|rejected|deferred), source_quote.
If none, return {"alternatives": []}.
Never mark an alternative as accepted here; that belongs to Decisions Extraction.`;

const DECISIONS_PROMPT = `You are an architecture analyst extracting DECISIONS, OPEN QUESTIONS and RISKS from a customer meeting transcript chunk.
A decision must be EXPLICITLY accepted in the transcript (phrases like "we decided", "we'll go with", "agreed", "approved", "принимаем").
If people only discussed options, set explicit=false or omit the decision.
Never promote a guessed or implied choice to an accepted decision.
Return JSON:
{
  "decisions": [{"id":"DEC-1","text":"...","explicit":true,"chosen_alternative_id":null,"rationale":"...","source_quote":"...","confidence":"high|medium|low","status":"accepted|discussed"}],
  "open_questions": [{"id":"Q-1","text":"...","source_quote":"..."}],
  "risks": [{"id":"RISK-1","text":"...","severity":"high|medium|low","source_quote":"..."}]
}`;

const GENERATE_ADR_SYSTEM = `You are a software architect writing an Architecture Decision Record.
Use ONLY the provided aggregated extraction and meeting context. Do not invent a decision that was not explicitly accepted.
If there is no explicit accepted decision, set status to "Needs clarification" and write decision as a clarification request, not as a fabricated choice.
If context is marked incomplete, mention that Jira/Confluence data was missing.
Return a single JSON object with exactly this shape:
${ADR_JSON_SHAPE}
status must be "Proposed" or "Needs clarification".`;

const RETRY_ADR_SYSTEM = `${GENERATE_ADR_SYSTEM}

Your previous output was not valid JSON. Return ONLY the JSON object, no markdown fences, no commentary.`;

module.exports = {
  EXTRACTION_INTERMEDIATE_SHAPE,
  ADR_JSON_SHAPE,
  REQUIREMENTS_PROMPT,
  CONSTRAINTS_PROMPT,
  ALTERNATIVES_PROMPT,
  DECISIONS_PROMPT,
  GENERATE_ADR_SYSTEM,
  RETRY_ADR_SYSTEM,
};
