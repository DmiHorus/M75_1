'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prompts = require('../n8n/lib/prompts');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'n8n/lib');
const OUT = path.join(ROOT, 'n8n/workflows/adr-generation-pipeline.json');

function readLib(name) {
  return fs.readFileSync(path.join(LIB, name), 'utf8');
}

function stripCjs(source) {
  return source
    .replace(/^'use strict';\s*/m, '')
    .replace(/^const \{[^}]+\} = require\('[^']+'\);\s*/gm, '')
    .replace(/\nmodule\.exports[\s\S]*$/m, '')
    .trim();
}

function n8nCode(libFiles, runner) {
  const bodies = libFiles.map((name) => stripCjs(readLib(name)));
  return `${bodies.join('\n\n')}\n\n${runner.trim()}\n`;
}

function nid(name) {
  const hex = crypto.createHash('md5').update(`adr-pipeline:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const OPENAI_CREDENTIALS = { openAiApi: { id: 'openai-api', name: 'OpenAI' } };
const OPENAI_BEARER = { httpBearerAuth: { id: 'openai-bearer', name: 'OpenAI Bearer' } };
const ATLASSIAN = { httpBasicAuth: { id: 'atlassian-basic', name: 'Atlassian API Token' } };
const NOTION = { httpHeaderAuth: { id: 'notion-header', name: 'Notion API' } };

function sticky(name, content, position, width = 280, height = 220, color = 7) {
  return {
    parameters: { content, height, width, color },
    id: nid(name),
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  };
}

function codeNode(name, position, jsCode) {
  return {
    parameters: { jsCode },
    id: nid(name),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function httpNode(name, position, parameters, extras = {}) {
  return {
    parameters,
    id: nid(name),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    ...extras,
  };
}

function chatModel(name, position, model = 'gpt-4o') {
  return {
    parameters: {
      model: { __rl: true, value: model, mode: 'list', cachedResultName: model },
      options: { temperature: 0 },
    },
    id: nid(name),
    name,
    type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
    typeVersion: 1.2,
    position,
    credentials: OPENAI_CREDENTIALS,
  };
}

function extractor(name, position, prompt, example) {
  return {
    parameters: {
      text: '={{ $json.extraction_text }}',
      schemaType: 'fromJson',
      jsonSchemaExample: example,
      options: {
        systemPromptTemplate: prompt,
        batching: { batchSize: 3, delayBetweenBatches: 250 },
      },
    },
    id: nid(name),
    name,
    type: '@n8n/n8n-nodes-langchain.informationExtractor',
    typeVersion: 1.2,
    position,
    continueOnFail: true,
    onError: 'continueRegularOutput',
  };
}

function ifNode(name, position, leftValue, operator, rightValue) {
  const condition = {
    id: nid(`${name}-cond`),
    leftValue,
    operator,
  };
  if (!operator.singleValue) condition.rightValue = rightValue;
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [condition],
        combinator: 'and',
      },
    },
    id: nid(name),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  };
}

function switchEquals(name, position, leftValue, cases) {
  return {
    parameters: {
      rules: {
        values: cases.map((item) => ({
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: nid(`${name}-${item}`),
                leftValue,
                rightValue: item,
                operator: { type: 'string', operation: 'equals' },
              },
            ],
            combinator: 'and',
          },
          renameOutput: true,
          outputKey: item,
        })),
      },
      options: { fallbackOutput: 'extra' },
    },
    id: nid(name),
    name,
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position,
  };
}

function connectMain(connections, from, to, fromIndex = 0) {
  if (!connections[from]) connections[from] = {};
  if (!connections[from].main) connections[from].main = [];
  while (connections[from].main.length <= fromIndex) connections[from].main.push([]);
  const targets = Array.isArray(to) ? to : [to];
  for (const name of targets) {
    connections[from].main[fromIndex].push({ node: name, type: 'main', index: 0 });
  }
}

function connectAi(connections, from, to, kind) {
  if (!connections[from]) connections[from] = {};
  connections[from][kind] = [[{ node: to, type: kind, index: 0 }]];
}

const ADR_EXAMPLE = `{
  "title": "ADR: Use REST for the public API",
  "status": "Proposed",
  "context": "The meeting compared REST and GraphQL under a two-engineer constraint.",
  "decision": "Use REST for the public API.",
  "alternatives": ["GraphQL"],
  "consequences": { "positive": ["Simpler ops"], "negative": ["More endpoints"] },
  "open_questions": ["How do we version the API?"],
  "risks": ["GraphQL advocates may push back"],
  "source_meeting": "meeting-123"
}`;

const REQ_EXAMPLE = `{
  "requirements": [
    { "id": "REQ-1", "text": "SSO for all tenants", "priority": "must", "source_quote": "We need SSO", "speaker_id": "Ada" }
  ]
}`;
const CON_EXAMPLE = `{
  "constraints": [
    { "id": "CON-1", "text": "Two engineers this quarter", "type": "time", "source_quote": "Budget is capped" }
  ]
}`;
const ALT_EXAMPLE = `{
  "alternatives": [
    { "id": "ALT-1", "title": "GraphQL", "description": "Single graph", "pros": ["flexible queries"], "cons": ["complexity"], "status": "discussed", "source_quote": "We compared REST and GraphQL" }
  ]
}`;
const DEC_EXAMPLE = `{
  "decisions": [
    { "id": "DEC-1", "text": "Use REST for the public API", "explicit": true, "chosen_alternative_id": null, "rationale": "simpler", "source_quote": "We decided to go with REST", "confidence": "high", "status": "accepted" }
  ],
  "open_questions": [{ "id": "Q-1", "text": "How do we version the API?", "source_quote": "Open question" }],
  "risks": [{ "id": "RISK-1", "text": "GraphQL fans will push back", "severity": "medium", "source_quote": "Risk is" }]
}`;

const nodes = [
  sticky('Note 1 Webhook', '## 1. Webhook Trigger\nPOST `/webhook/adr-meeting-completed`\nCanonical fields: `meeting_id`, `recording_url`, `participants`, `start_time`, `project_id`, `jira_epic_id`.\nAlso accepts Zoom `recording.completed`.\nResponds 202 immediately so Zoom/Teams do not time out.', [-60, 40], 300, 240, 5),
  sticky('Note 2 Recording STT', '## 2–3. Recording + Whisper STT\nDownloads the recording, then calls Whisper (`verbose_json`) to keep timestamps.\n`speaker_id` is preserved when the STT/diarization API provides it; otherwise participant ids are used as a fallback.\nInline `transcript` skips download/STT for dry-runs.', [780, 40], 320, 260, 6),
  sticky('Note 3 Preprocess', '## 4. Preprocess / chunking\nStrips fillers, `[inaudible]`, recording notices; normalizes whitespace; splits oversized transcripts into overlapping-safe chunks.', [1680, 40], 280, 200, 4),
  sticky('Note 4 Context', '## 5. Jira / Confluence context\nSeparate integration nodes. Failures **do not abort** the workflow: ADR is generated with `INCOMPLETE CONTEXT`.', [1960, 40], 300, 200, 3),
  sticky('Note 5 Extraction', '## 6. LangChain extraction\nFour Information Extractor nodes (n8n LangChain, no external Langflow runtime):\n1. Requirements\n2. Constraints\n3. Alternatives\n4. Decisions (+ questions/risks)\nKeeps discussed options away from accepted decisions.', [3000, -80], 320, 280, 2),
  sticky('Note 6 Aggregate ADR', '## 7–9. Aggregate → Generate → Validate\nDedup, match alternatives to decisions, detect contradictions.\nADR JSON is parsed; invalid JSON is retried once, then the workflow stops with a notification (no crash, no publish).\nNo explicit decision → status **Needs clarification**.', [3920, 40], 340, 280, 7),
  sticky('Note 7 HITL Publish', '## 10–11. Human review then publish\nWait-for-form (`Approve` / `Reject` / `Request changes`) is on the only path to Confluence, Notion, Jira and Slack/Teams.\nPublication cannot run unless the architect approves.', [5880, 40], 340, 240, 1),

  {
    parameters: {
      httpMethod: 'POST',
      path: 'adr-meeting-completed',
      responseMode: 'onReceived',
      options: { responseCode: 202 },
    },
    id: nid('Webhook Trigger'),
    name: 'Webhook Trigger',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 400],
    webhookId: 'adr-meeting-completed',
  },

  codeNode(
    'Normalize Meeting Event',
    [280, 400],
    n8nCode(['normalize_webhook.js'], `
const meeting = normalizeWebhookPayload($input.first().json);
return [{ json: meeting }];
`),
  ),

  switchEquals('Switch Transcript Source', [560, 400], '={{ $json.source_kind }}', [
    'inline_transcript',
    'transcript_url',
    'recording',
  ]),

  codeNode(
    'Parse Inline Transcript',
    [840, 220],
    n8nCode(['parse_stt.js'], `
const meeting = $input.first().json;
const parsed = utterancesFromPlainTranscript(meeting.transcript, meeting.participants);
return [{ json: { meeting, ...parsed } }];
`),
  ),

  httpNode('Fetch Transcript URL', [840, 400], {
    method: 'GET',
    url: '={{ $json.transcript_url }}',
    options: {},
  }),

  codeNode(
    'Parse Remote Transcript',
    [1120, 400],
    n8nCode(['parse_stt.js'], `
const meeting = $('Normalize Meeting Event').first().json;
const payload = $input.first().json;
const text = payload.text || payload.transcript || (typeof payload === 'string' ? payload : JSON.stringify(payload));
const parsed = utterancesFromPlainTranscript(text, meeting.participants);
return [{ json: { meeting, ...parsed } }];
`),
  ),

  httpNode('Download Recording', [840, 620], {
    method: 'GET',
    url: '={{ $json.recording_url }}',
    options: {
      response: {
        response: {
          responseFormat: 'file',
        },
      },
    },
  }),

  httpNode(
    'Speech-to-Text',
    [1120, 620],
    {
      method: 'POST',
      url: 'https://api.openai.com/v1/audio/transcriptions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: {
        parameters: [
          { name: 'file', parameterType: 'formBinaryData', inputDataFieldName: 'data' },
          { name: 'model', value: 'whisper-1' },
          { name: 'response_format', value: 'verbose_json' },
          { name: 'timestamp_granularities[]', value: 'segment' },
        ],
      },
      options: {},
    },
    { credentials: OPENAI_BEARER },
  ),

  codeNode(
    'Parse STT Output',
    [1400, 620],
    n8nCode(['parse_stt.js'], `
const meeting = $('Normalize Meeting Event').first().json;
const parsed = parseSttResponse($input.first().json, meeting.participants);
return [{ json: { meeting, ...parsed } }];
`),
  ),

  codeNode(
    'Preprocess and Chunk',
    [1680, 400],
    n8nCode(['preprocess.js'], `
const item = $input.first().json;
const processed = preprocessTranscript(item, { maxChars: 6000 });
if (!processed.chunks.length) {
  processed.chunks = [{
    chunk_index: 0,
    chunk_total: 1,
    text: processed.cleaned_text || '(empty transcript)',
    start_offset: 0,
    end_offset: 0,
  }];
}
return [{ json: { meeting: item.meeting, utterances: item.utterances || [], ...processed } }];
`),
  ),

  ifNode(
    'IF Has Jira Epic',
    [1960, 260],
    '={{ $json.meeting.jira_epic_id }}',
    { type: 'string', operation: 'notEmpty', singleValue: true },
  ),
  ifNode(
    'IF Has Project Id',
    [1960, 560],
    '={{ $json.meeting.project_id }}',
    { type: 'string', operation: 'notEmpty', singleValue: true },
  ),

  httpNode(
    'Fetch Jira Context',
    [2240, 180],
    {
      method: 'GET',
      url: "={{ $env.JIRA_BASE_URL }}/rest/api/3/issue/{{ $json.meeting.jira_epic_id }}",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      options: {},
    },
    {
      credentials: ATLASSIAN,
      continueOnFail: true,
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
    },
  ),
  codeNode(
    'Empty Jira Context',
    [2240, 340],
    n8nCode([], `return [{ json: { jira_skipped: true, issues: [] } }];`),
  ),
  codeNode(
    'Wrap Jira Result',
    [2480, 260],
    n8nCode([], `return [{ json: { jiraItem: $input.first().json } }];`),
  ),

  httpNode(
    'Fetch Confluence Context',
    [2240, 480],
    {
      method: 'GET',
      url: "={{ $env.CONFLUENCE_BASE_URL }}/wiki/rest/api/content/search?cql=text~{{ $json.meeting.project_id }}%20AND%20type=page&limit=5",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      options: {},
    },
    {
      credentials: ATLASSIAN,
      continueOnFail: true,
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
    },
  ),
  codeNode(
    'Empty Confluence Context',
    [2240, 640],
    n8nCode([], `return [{ json: { confluence_skipped: true, results: [] } }];`),
  ),
  codeNode(
    'Wrap Confluence Result',
    [2480, 560],
    n8nCode([], `return [{ json: { confluenceItem: $input.first().json } }];`),
  ),

  {
    parameters: { mode: 'combine', combineBy: 'combineByPosition', numberInputs: 2 },
    id: nid('Merge Context Sources'),
    name: 'Merge Context Sources',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.1,
    position: [2520, 400],
  },

  codeNode(
    'Assemble Context Package',
    [2760, 400],
    n8nCode(['assemble_context.js'], `
const processed = $('Preprocess and Chunk').first().json;
const merged = $input.first().json;
const context = assembleContext({
  meeting: processed.meeting,
  jiraItem: merged.jiraItem || { jira_skipped: true },
  confluenceItem: merged.confluenceItem || { confluence_skipped: true },
});
return [{ json: { ...processed, context } }];
`),
  ),

  codeNode(
    'Split Chunks For Extraction',
    [3000, 400],
    n8nCode([], `
const assembled = $input.first().json;
return assembled.chunks.map((chunk) => ({
  json: {
    ...chunk,
    meeting: assembled.meeting,
    context: assembled.context,
    extraction_text: [
      'MEETING_ID: ' + assembled.meeting.meeting_id,
      'TITLE: ' + (assembled.meeting.title || ''),
      'PARTICIPANTS: ' + (assembled.meeting.participants || []).map((p) => p.name || p.id).join(', '),
      assembled.context.context_text,
      'CHUNK ' + (chunk.chunk_index + 1) + '/' + chunk.chunk_total + ':',
      chunk.text,
    ].join('\\n'),
  },
}));
`),
  ),

  extractor('Requirements Extraction', [3280, 80], prompts.REQUIREMENTS_PROMPT, REQ_EXAMPLE),
  chatModel('OpenAI Requirements', [3280, -80], 'gpt-4o-mini'),
  extractor('Constraints Extraction', [3280, 280], prompts.CONSTRAINTS_PROMPT, CON_EXAMPLE),
  chatModel('OpenAI Constraints', [3520, 280], 'gpt-4o-mini'),
  extractor('Alternatives Extraction', [3280, 520], prompts.ALTERNATIVES_PROMPT, ALT_EXAMPLE),
  chatModel('OpenAI Alternatives', [3520, 520], 'gpt-4o-mini'),
  extractor('Decisions Extraction', [3280, 760], prompts.DECISIONS_PROMPT, DEC_EXAMPLE),
  chatModel('OpenAI Decisions', [3520, 760], 'gpt-4o-mini'),

  codeNode(
    'Tag Requirements',
    [3760, 80],
    n8nCode([], `
const srcItems = $('Split Chunks For Extraction').all();
return $input.all().map((item, index) => {
  const src = srcItems[index] ? srcItems[index].json : {};
  const output = item.json.output || item.json;
  return { json: { extractor: 'requirements', chunk_index: src.chunk_index ?? index, requirements: output.requirements || [], constraints: [], alternatives: [], decisions: [], open_questions: [], risks: [] } };
});
`),
  ),
  codeNode(
    'Tag Constraints',
    [3760, 280],
    n8nCode([], `
const srcItems = $('Split Chunks For Extraction').all();
return $input.all().map((item, index) => {
  const src = srcItems[index] ? srcItems[index].json : {};
  const output = item.json.output || item.json;
  return { json: { extractor: 'constraints', chunk_index: src.chunk_index ?? index, requirements: [], constraints: output.constraints || [], alternatives: [], decisions: [], open_questions: [], risks: [] } };
});
`),
  ),
  codeNode(
    'Tag Alternatives',
    [3760, 520],
    n8nCode([], `
const srcItems = $('Split Chunks For Extraction').all();
return $input.all().map((item, index) => {
  const src = srcItems[index] ? srcItems[index].json : {};
  const output = item.json.output || item.json;
  return { json: { extractor: 'alternatives', chunk_index: src.chunk_index ?? index, requirements: [], constraints: [], alternatives: output.alternatives || [], decisions: [], open_questions: [], risks: [] } };
});
`),
  ),
  codeNode(
    'Tag Decisions',
    [3760, 760],
    n8nCode([], `
const srcItems = $('Split Chunks For Extraction').all();
return $input.all().map((item, index) => {
  const src = srcItems[index] ? srcItems[index].json : {};
  const output = item.json.output || item.json;
  return { json: { extractor: 'decisions', chunk_index: src.chunk_index ?? index, requirements: [], constraints: [], alternatives: [], decisions: output.decisions || [], open_questions: output.open_questions || [], risks: output.risks || [] } };
});
`),
  ),

  {
    parameters: { mode: 'append', numberInputs: 4 },
    id: nid('Merge Extraction Streams'),
    name: 'Merge Extraction Streams',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.1,
    position: [4000, 400],
  },

  codeNode(
    'Aggregate Reduce',
    [4240, 400],
    n8nCode(['aggregate.js'], `
const items = $input.all().map((item) => item.json);
const byChunk = new Map();
for (const item of items) {
  const idx = item.chunk_index ?? 0;
  if (!byChunk.has(idx)) {
    byChunk.set(idx, { chunk_index: idx, requirements: [], constraints: [], alternatives: [], decisions: [], open_questions: [], risks: [] });
  }
  const bucket = byChunk.get(idx);
  for (const key of ['requirements', 'constraints', 'alternatives', 'decisions', 'open_questions', 'risks']) {
    if (Array.isArray(item[key])) bucket[key].push(...item[key]);
  }
}
const aggregated = aggregateExtractions([...byChunk.values()]);
const assembled = $('Assemble Context Package').first().json;
return [{ json: {
  meeting: assembled.meeting,
  context: assembled.context,
  aggregated,
  extraction: {
    requirements: aggregated.requirements,
    constraints: aggregated.constraints,
    alternatives: aggregated.alternatives,
    decisions: aggregated.decisions,
    open_questions: aggregated.open_questions,
    risks: aggregated.risks,
  },
} }];
`),
  ),

  {
    parameters: {
      promptType: 'define',
      text: "={{ 'Meeting ' + $json.meeting.meeting_id + '\\nSource: ' + $json.meeting.source + '\\n\\nCONTEXT PACKAGE:\\n' + $json.context.context_text + '\\n\\nAGGREGATED EXTRACTION JSON:\\n' + JSON.stringify($json.extraction, null, 2) + '\\n\\nWrite the ADR JSON now. If extraction.decisions has no explicit accepted item, status MUST be Needs clarification and you MUST NOT invent a decision.' }}",
      hasOutputParser: true,
      messages: {
        messageValues: [{ type: 'SystemMessagePromptTemplate', message: prompts.GENERATE_ADR_SYSTEM }],
      },
    },
    id: nid('Generate ADR'),
    name: 'Generate ADR',
    type: '@n8n/n8n-nodes-langchain.chainLlm',
    typeVersion: 1.7,
    position: [4480, 400],
    continueOnFail: true,
    onError: 'continueRegularOutput',
  },
  chatModel('OpenAI Generate ADR', [4480, 240], 'gpt-4o'),
  {
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: ADR_EXAMPLE,
      autoFix: true,
    },
    id: nid('Structured Output Parser ADR'),
    name: 'Structured Output Parser ADR',
    type: '@n8n/n8n-nodes-langchain.outputParserStructured',
    typeVersion: 1.2,
    position: [4480, 560],
  },
  chatModel('OpenAI Autofix Parser', [4680, 560], 'gpt-4o-mini'),

  codeNode(
    'Parse Generated ADR',
    [4920, 400],
    n8nCode(['parse_ai_json.js'], `
const previous = $('Aggregate Reduce').first().json;
const parsed = parseAiJson($input.first().json);
return [{ json: { ...previous, json_ok: parsed.ok, json_error: parsed.error, adr_raw: parsed.data, retry_count: 0 } }];
`),
  ),

  ifNode(
    'IF ADR JSON Valid',
    [5160, 400],
    '={{ $json.json_ok }}',
    { type: 'boolean', operation: 'true', singleValue: true },
  ),

  {
    parameters: {
      promptType: 'define',
      text: "={{ 'Previous error: ' + $json.json_error + '\\n\\nMeeting ' + $json.meeting.meeting_id + '\\n\\nCONTEXT:\\n' + $json.context.context_text + '\\n\\nEXTRACTION:\\n' + JSON.stringify($json.extraction, null, 2) + '\\n\\nReturn ONLY valid ADR JSON. No markdown.' }}",
      hasOutputParser: false,
      messages: {
        messageValues: [{ type: 'SystemMessagePromptTemplate', message: prompts.RETRY_ADR_SYSTEM }],
      },
    },
    id: nid('Retry Generate ADR'),
    name: 'Retry Generate ADR',
    type: '@n8n/n8n-nodes-langchain.chainLlm',
    typeVersion: 1.7,
    position: [5400, 620],
    continueOnFail: true,
    onError: 'continueRegularOutput',
  },
  chatModel('OpenAI Retry ADR', [5400, 780], 'gpt-4o'),

  codeNode(
    'Parse Retry ADR',
    [5640, 620],
    n8nCode(['parse_ai_json.js'], `
const previous = $('Parse Generated ADR').first().json;
const parsed = parseAiJson($input.first().json);
return [{ json: { ...previous, json_ok: parsed.ok, json_error: parsed.error, adr_raw: parsed.data, retry_count: 1 } }];
`),
  ),

  ifNode(
    'IF Retry JSON Valid',
    [5880, 620],
    '={{ $json.json_ok }}',
    { type: 'boolean', operation: 'true', singleValue: true },
  ),

  httpNode(
    'Notify Invalid JSON',
    [6120, 820],
    {
      method: 'POST',
      url: '={{ $env.SLACK_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ text: ':x: ADR pipeline stopped: invalid JSON from AI after retry. Meeting ' + $('Normalize Meeting Event').first().json.meeting_id + ' — ' + $json.json_error }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),
  codeNode(
    'Log Invalid JSON Stop',
    [6360, 820],
    n8nCode([], `
const item = $input.first().json;
const meeting = $('Normalize Meeting Event').first().json;
console.log(JSON.stringify({ level: 'error', event: 'adr_invalid_json', meeting_id: meeting.meeting_id, error: item.json_error, retry_count: item.retry_count }));
return [{ json: { stopped: true, reason: 'invalid_json', meeting_id: meeting.meeting_id, error: item.json_error } }];
`),
  ),

  codeNode(
    'Validate ADR',
    [5400, 280],
    n8nCode(['validate.js'], `
const item = $input.first().json;
const result = validateAdr({
  adr: item.adr_raw,
  aggregated: { ...item.aggregated, source_meeting: item.meeting.meeting_id },
  jsonError: item.json_ok ? null : item.json_error,
  contextIncomplete: Boolean(item.context && item.context.incomplete),
});
if (result.adr) result.adr.source_meeting = item.meeting.meeting_id;
return [{ json: { ...item, validation: result, adr: result.adr } }];
`),
  ),

  codeNode(
    'Prepare Review Package',
    [5640, 280],
    n8nCode(['format_document.js'], `
const item = $input.first().json;
const extras = {
  warnings: (item.validation.issues || []).map((issue) => issue.message),
  reviewUrl: $execution.resumeFormUrl,
};
const documents = buildPublishPayloads(item.adr, extras);
return [{ json: {
  meeting: item.meeting,
  aggregated: item.aggregated,
  extraction: item.extraction,
  validation: item.validation,
  adr: item.adr,
  documents,
  review_url: extras.reviewUrl,
} }];
`),
  ),

  httpNode(
    'Notify Architect Slack',
    [5880, 180],
    {
      method: 'POST',
      url: '={{ $env.SLACK_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ text: $json.documents.slack_mrkdwn + '\\n\\nHuman review is required before publication.\\nOpen the review form: ' + $json.review_url }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),
  httpNode(
    'Notify Architect Teams',
    [5880, 360],
    {
      method: 'POST',
      url: '={{ $env.TEAMS_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ text: $json.adr.title + ' [' + $json.adr.status + '] — review before publish: ' + $json.review_url }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),

  {
    parameters: { mode: 'combine', combineBy: 'combineByPosition', numberInputs: 2 },
    id: nid('Merge Review Notifications'),
    name: 'Merge Review Notifications',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.1,
    position: [6120, 280],
  },

  {
    parameters: {
      resume: 'form',
      formTitle: 'ADR Human Review',
      formDescription:
        'Approve, reject, or request changes. Publication runs only after Approve. Status Needs clarification still allows approve-to-publish with the clarification mark.',
      formFields: {
        values: [
          {
            fieldLabel: 'action',
            fieldType: 'dropdown',
            requiredField: true,
            fieldOptions: {
              values: [{ option: 'Approve' }, { option: 'Reject' }, { option: 'Request changes' }],
            },
          },
          { fieldLabel: 'comments', fieldType: 'textarea', requiredField: false },
        ],
      },
      responseMode: 'onReceived',
      options: {},
    },
    id: nid('Human Review'),
    name: 'Human Review',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    position: [6360, 280],
    webhookId: nid('human-review-wait'),
  },

  codeNode(
    'Parse Review Decision',
    [6600, 280],
    n8nCode([], `
const review = $input.first().json;
const prepared = $('Prepare Review Package').first().json;
const action = review.action || review['Review decision'] || review.data?.action || '';
return [{ json: {
  ...prepared,
  review_action: String(action).trim(),
  review_comments: review.comments || review.Comments || review.data?.comments || '',
} }];
`),
  ),

  switchEquals('Switch Review Action', [6840, 280], '={{ $json.review_action }}', [
    'Approve',
    'Reject',
    'Request changes',
  ]),

  httpNode(
    'Publish Confluence',
    [7160, 40],
    {
      method: 'POST',
      url: '={{ $env.CONFLUENCE_BASE_URL }}/wiki/rest/api/content',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ type: 'page', title: $json.adr.title + ' (' + $json.adr.source_meeting + ')', space: { key: $env.CONFLUENCE_SPACE_KEY }, body: { storage: { value: $json.documents.confluence_storage, representation: 'storage' } } }) }}",
      options: {},
    },
    {
      credentials: ATLASSIAN,
      continueOnFail: true,
      onError: 'continueRegularOutput',
    },
  ),
  httpNode(
    'Publish Notion',
    [7160, 200],
    {
      method: 'POST',
      url: 'https://api.notion.com/v1/pages',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'Notion-Version', value: '2022-06-28' }],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ parent: { database_id: $env.NOTION_DATABASE_ID }, properties: { [$env.NOTION_TITLE_PROPERTY || 'Name']: { title: [{ text: { content: $json.adr.title } }] } }, children: $json.documents.notion_children }) }}",
      options: {},
    },
    {
      credentials: NOTION,
      continueOnFail: true,
      onError: 'continueRegularOutput',
    },
  ),
  httpNode(
    'Publish Jira Comment',
    [7160, 360],
    {
      method: 'POST',
      url: "={{ $env.JIRA_BASE_URL }}/rest/api/3/issue/{{ $json.meeting.jira_epic_id }}/comment",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ body: $json.documents.jira_adf }) }}',
      options: {},
    },
    {
      credentials: ATLASSIAN,
      continueOnFail: true,
      onError: 'continueRegularOutput',
    },
  ),
  httpNode(
    'Notify Slack Published',
    [7160, 520],
    {
      method: 'POST',
      url: '={{ $env.SLACK_PUBLISH_WEBHOOK_URL || $env.SLACK_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ text: ':white_check_mark: ADR published after architect approval.\\n' + $json.documents.slack_mrkdwn }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),
  httpNode(
    'Notify Teams Published',
    [7160, 680],
    {
      method: 'POST',
      url: '={{ $env.TEAMS_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ text: 'ADR published: ' + $json.adr.title + ' [' + $json.adr.status + ']' }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),

  {
    parameters: { mode: 'append', numberInputs: 5 },
    id: nid('Merge Publish Results'),
    name: 'Merge Publish Results',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.1,
    position: [7480, 360],
  },
  codeNode(
    'Summarize Publication',
    [7720, 360],
    n8nCode([], `
const prepared = $('Parse Review Decision').first().json;
const results = $input.all().map((item) => item.json);
return [{ json: { published: true, meeting_id: prepared.meeting.meeting_id, adr: prepared.adr, review_action: prepared.review_action, publish_results: results } }];
`),
  ),

  httpNode(
    'Notify Rejected',
    [7160, 860],
    {
      method: 'POST',
      url: '={{ $env.SLACK_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ text: ':no_entry: ADR rejected by architect. Meeting ' + $json.adr.source_meeting + '. Comments: ' + ($json.review_comments || 'none') }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),
  httpNode(
    'Notify Request Changes',
    [7160, 1020],
    {
      method: 'POST',
      url: '={{ $env.SLACK_WEBHOOK_URL }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        "={{ JSON.stringify({ text: ':pencil: Architect requested changes for ' + $json.adr.title + '. Comments: ' + ($json.review_comments || 'none') + '. Publication skipped.' }) }}",
      options: {},
    },
    { continueOnFail: true, onError: 'continueRegularOutput' },
  ),
];

const connections = {};

connectMain(connections, 'Webhook Trigger', 'Normalize Meeting Event');
connectMain(connections, 'Normalize Meeting Event', 'Switch Transcript Source');
connectMain(connections, 'Switch Transcript Source', 'Parse Inline Transcript', 0);
connectMain(connections, 'Switch Transcript Source', 'Fetch Transcript URL', 1);
connectMain(connections, 'Switch Transcript Source', 'Download Recording', 2);
connectMain(connections, 'Fetch Transcript URL', 'Parse Remote Transcript');
connectMain(connections, 'Download Recording', 'Speech-to-Text');
connectMain(connections, 'Speech-to-Text', 'Parse STT Output');
connectMain(connections, 'Parse Inline Transcript', 'Preprocess and Chunk');
connectMain(connections, 'Parse Remote Transcript', 'Preprocess and Chunk');
connectMain(connections, 'Parse STT Output', 'Preprocess and Chunk');

connectMain(connections, 'Preprocess and Chunk', ['IF Has Jira Epic', 'IF Has Project Id']);
connectMain(connections, 'IF Has Jira Epic', 'Fetch Jira Context', 0);
connectMain(connections, 'IF Has Jira Epic', 'Empty Jira Context', 1);
connectMain(connections, 'IF Has Project Id', 'Fetch Confluence Context', 0);
connectMain(connections, 'IF Has Project Id', 'Empty Confluence Context', 1);

connectMain(connections, 'Fetch Jira Context', 'Wrap Jira Result');
connectMain(connections, 'Empty Jira Context', 'Wrap Jira Result');
connectMain(connections, 'Fetch Confluence Context', 'Wrap Confluence Result');
connectMain(connections, 'Empty Confluence Context', 'Wrap Confluence Result');
connections['Wrap Jira Result'] = { main: [[{ node: 'Merge Context Sources', type: 'main', index: 0 }]] };
connections['Wrap Confluence Result'] = { main: [[{ node: 'Merge Context Sources', type: 'main', index: 1 }]] };

connectMain(connections, 'Merge Context Sources', 'Assemble Context Package');
connectMain(connections, 'Assemble Context Package', 'Split Chunks For Extraction');

connectMain(connections, 'Split Chunks For Extraction', [
  'Requirements Extraction',
  'Constraints Extraction',
  'Alternatives Extraction',
  'Decisions Extraction',
]);
connectAi(connections, 'OpenAI Requirements', 'Requirements Extraction', 'ai_languageModel');
connectAi(connections, 'OpenAI Constraints', 'Constraints Extraction', 'ai_languageModel');
connectAi(connections, 'OpenAI Alternatives', 'Alternatives Extraction', 'ai_languageModel');
connectAi(connections, 'OpenAI Decisions', 'Decisions Extraction', 'ai_languageModel');

connectMain(connections, 'Requirements Extraction', 'Tag Requirements');
connectMain(connections, 'Constraints Extraction', 'Tag Constraints');
connectMain(connections, 'Alternatives Extraction', 'Tag Alternatives');
connectMain(connections, 'Decisions Extraction', 'Tag Decisions');

connections['Tag Requirements'] = { main: [[{ node: 'Merge Extraction Streams', type: 'main', index: 0 }]] };
connections['Tag Constraints'] = { main: [[{ node: 'Merge Extraction Streams', type: 'main', index: 1 }]] };
connections['Tag Alternatives'] = { main: [[{ node: 'Merge Extraction Streams', type: 'main', index: 2 }]] };
connections['Tag Decisions'] = { main: [[{ node: 'Merge Extraction Streams', type: 'main', index: 3 }]] };

connectMain(connections, 'Merge Extraction Streams', 'Aggregate Reduce');
connectMain(connections, 'Aggregate Reduce', 'Generate ADR');
connectAi(connections, 'OpenAI Generate ADR', 'Generate ADR', 'ai_languageModel');
connectAi(connections, 'Structured Output Parser ADR', 'Generate ADR', 'ai_outputParser');
connectAi(connections, 'OpenAI Autofix Parser', 'Structured Output Parser ADR', 'ai_languageModel');

connectMain(connections, 'Generate ADR', 'Parse Generated ADR');
connectMain(connections, 'Parse Generated ADR', 'IF ADR JSON Valid');
connectMain(connections, 'IF ADR JSON Valid', 'Validate ADR', 0);
connectMain(connections, 'IF ADR JSON Valid', 'Retry Generate ADR', 1);
connectMain(connections, 'Retry Generate ADR', 'Parse Retry ADR');
connectAi(connections, 'OpenAI Retry ADR', 'Retry Generate ADR', 'ai_languageModel');
connectMain(connections, 'Parse Retry ADR', 'IF Retry JSON Valid');
connectMain(connections, 'IF Retry JSON Valid', 'Validate ADR', 0);
connectMain(connections, 'IF Retry JSON Valid', 'Notify Invalid JSON', 1);
connectMain(connections, 'Notify Invalid JSON', 'Log Invalid JSON Stop');

connectMain(connections, 'Validate ADR', 'Prepare Review Package');
connectMain(connections, 'Prepare Review Package', ['Notify Architect Slack', 'Notify Architect Teams']);
connections['Notify Architect Slack'] = { main: [[{ node: 'Merge Review Notifications', type: 'main', index: 0 }]] };
connections['Notify Architect Teams'] = { main: [[{ node: 'Merge Review Notifications', type: 'main', index: 1 }]] };
connectMain(connections, 'Merge Review Notifications', 'Human Review');
connectMain(connections, 'Human Review', 'Parse Review Decision');
connectMain(connections, 'Parse Review Decision', 'Switch Review Action');

connectMain(connections, 'Switch Review Action', [
  'Publish Confluence',
  'Publish Notion',
  'Publish Jira Comment',
  'Notify Slack Published',
  'Notify Teams Published',
], 0);
connectMain(connections, 'Switch Review Action', 'Notify Rejected', 1);
connectMain(connections, 'Switch Review Action', 'Notify Request Changes', 2);

connections['Publish Confluence'] = { main: [[{ node: 'Merge Publish Results', type: 'main', index: 0 }]] };
connections['Publish Notion'] = { main: [[{ node: 'Merge Publish Results', type: 'main', index: 1 }]] };
connections['Publish Jira Comment'] = { main: [[{ node: 'Merge Publish Results', type: 'main', index: 2 }]] };
connections['Notify Slack Published'] = { main: [[{ node: 'Merge Publish Results', type: 'main', index: 3 }]] };
connections['Notify Teams Published'] = { main: [[{ node: 'Merge Publish Results', type: 'main', index: 4 }]] };
connectMain(connections, 'Merge Publish Results', 'Summarize Publication');

const workflow = {
  name: 'ADR Generation Pipeline',
  nodes,
  connections,
  active: false,
  settings: {
    executionOrder: 'v1',
    saveManualExecutions: true,
    callerPolicy: 'workflowsFromSameOwner',
    errorWorkflow: '',
  },
  versionId: nid('workflow-version'),
  meta: {
    templateCredsSetupCompleted: false,
    description:
      'End-to-end meeting recording → Architecture Decision Record. LangChain extraction runs inside n8n. Human review is required before Confluence/Notion/Jira/Slack publication.',
  },
  pinData: {
    'Webhook Trigger': [
      {
        json: JSON.parse(fs.readFileSync(path.join(ROOT, 'samples/webhook-canonical.json'), 'utf8')),
      },
    ],
  },
  tags: [{ name: 'adr' }, { name: 'architecture' }, { name: 'langchain' }],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`Wrote ${OUT} with ${nodes.length} nodes`);
