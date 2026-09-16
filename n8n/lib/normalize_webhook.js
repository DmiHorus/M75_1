'use strict';

function asArray(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeParticipant(participant) {
  if (typeof participant === 'string') {
    return { id: participant, name: participant, email: '' };
  }
  const name =
    participant.name ||
    participant.user_name ||
    participant.displayName ||
    participant.email ||
    String(participant.id || 'unknown');
  return {
    id: String(participant.id || participant.user_id || participant.email || name),
    name,
    email: participant.email || participant.user_email || '',
  };
}

function pickRecordingUrl(payload) {
  if (payload.recording_url) return payload.recording_url;
  if (payload.download_url) return payload.download_url;
  const files =
    payload.payload?.object?.recording_files ||
    payload.object?.recording_files ||
    payload.recording_files ||
    [];
  const preferred =
    files.find((file) => /mp3|m4a|wav|mp4|ogg/i.test(String(file.file_type || file.fileType || file.extension || ''))) ||
    files[0];
  return preferred?.download_url || preferred?.play_url || preferred?.url || '';
}

function normalizeWebhookPayload(raw) {
  const body = raw?.body && typeof raw.body === 'object' ? raw.body : raw || {};
  const zoomObj = body.payload?.object || (body.event && body.payload ? body.payload.object : null);
  const teams = body.meeting || body.value || null;

  const meetingId = String(
    body.meeting_id ||
      body.meetingId ||
      zoomObj?.uuid ||
      zoomObj?.id ||
      teams?.id ||
      body.id ||
      '',
  );

  const participants = asArray(
    body.participants || zoomObj?.participants || body.attendees || teams?.participants || [],
  ).map(normalizeParticipant);

  const transcript = body.transcript || body.transcript_text || body.text || '';
  const transcriptUrl = body.transcript_url || body.transcriptUrl || '';
  const recordingUrl = pickRecordingUrl(body) || pickRecordingUrl(zoomObj || {}) || body.recordingUrl || '';

  let sourceKind = 'recording';
  if (String(transcript).trim()) sourceKind = 'inline_transcript';
  else if (transcriptUrl) sourceKind = 'transcript_url';

  return {
    meeting_id: meetingId || `meeting-${Date.now()}`,
    recording_url: recordingUrl,
    transcript: String(transcript || ''),
    transcript_url: String(transcriptUrl || ''),
    participants,
    start_time: body.start_time || zoomObj?.start_time || body.start || teams?.startDateTime || null,
    project_id: String(body.project_id || body.projectId || ''),
    jira_epic_id: String(body.jira_epic_id || body.jiraEpicId || body.epic_id || ''),
    title: body.title || zoomObj?.topic || body.topic || teams?.subject || '',
    source: zoomObj ? 'zoom' : body.source || (teams ? 'teams' : 'canonical'),
    source_kind: sourceKind,
    raw_event: body.event || null,
  };
}

module.exports = {
  asArray,
  normalizeParticipant,
  pickRecordingUrl,
  normalizeWebhookPayload,
};
