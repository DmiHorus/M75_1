'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWebhookPayload } = require('../n8n/lib/normalize_webhook');

describe('normalizeWebhookPayload', () => {
  it('accepts the canonical Zoom/Teams-like payload from the prompt', () => {
    const result = normalizeWebhookPayload({
      meeting_id: 'meeting-123',
      recording_url: 'https://example.com/rec.mp4',
      participants: [{ id: 'u1', name: 'Ada' }, 'Bob'],
      start_time: '2026-09-16T12:00:00Z',
      project_id: 'PRJ-1',
      jira_epic_id: 'ARCH-9',
    });
    assert.equal(result.meeting_id, 'meeting-123');
    assert.equal(result.source_kind, 'recording');
    assert.equal(result.jira_epic_id, 'ARCH-9');
    assert.equal(result.participants.length, 2);
    assert.equal(result.participants[1].name, 'Bob');
  });

  it('unwraps n8n webhook body and Zoom recording.completed', () => {
    const result = normalizeWebhookPayload({
      body: {
        event: 'recording.completed',
        payload: {
          object: {
            uuid: 'zoom-uuid',
            topic: 'Architecture sync',
            start_time: '2026-09-16T10:00:00Z',
            recording_files: [{ file_type: 'MP4', download_url: 'https://zoom.us/rec.mp4' }],
            participants: [{ user_id: '1', name: 'Chen' }],
          },
        },
        project_id: 'PAY',
        jira_epic_id: 'PAY-100',
      },
    });
    assert.equal(result.meeting_id, 'zoom-uuid');
    assert.equal(result.source, 'zoom');
    assert.equal(result.recording_url, 'https://zoom.us/rec.mp4');
    assert.equal(result.title, 'Architecture sync');
  });

  it('prefers inline transcript over recording download', () => {
    const result = normalizeWebhookPayload({
      meeting_id: 'm1',
      transcript: 'We decided to use Postgres.',
      recording_url: 'https://example.com/rec.mp4',
    });
    assert.equal(result.source_kind, 'inline_transcript');
  });
});
