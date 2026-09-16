'use strict';

function parseSttResponse(stt, participants = []) {
  const payload = stt || {};
  const segments = payload.segments || payload.utterances || payload.chunks || [];
  const fallbackSpeaker = (index) => {
    if (!participants.length) return null;
    return participants[index % participants.length]?.id || participants[index % participants.length]?.name || null;
  };

  const utterances = segments
    .map((segment, index) => {
      const speakerId =
        segment.speaker_id ||
        segment.speaker ||
        segment.spk ||
        (segment.speaker_label != null ? String(segment.speaker_label) : null) ||
        fallbackSpeaker(index);
      return {
        speaker_id: speakerId == null ? null : String(speakerId),
        start: segment.start ?? segment.start_time ?? segment.offset ?? null,
        end: segment.end ?? segment.end_time ?? null,
        text: String(segment.text || segment.transcript || segment.content || '').trim(),
      };
    })
    .filter((utterance) => utterance.text);

  const text =
    String(payload.text || payload.transcript || '').trim() ||
    utterances.map((utterance) => utterance.text).join(' ');

  return {
    text,
    utterances,
    language: payload.language || payload.detected_language || null,
    duration: payload.duration ?? null,
  };
}

function utterancesFromPlainTranscript(text, participants = []) {
  const cleaned = String(text || '').trim();
  if (!cleaned) {
    return { text: '', utterances: [], language: null, duration: null };
  }
  const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const utterances = lines.map((line, index) => {
    const tagged = line.match(/^([^:]{1,80}):\s*(.+)$/);
    if (tagged) {
      return {
        speaker_id: tagged[1].trim(),
        start: null,
        end: null,
        text: tagged[2].trim(),
      };
    }
    return {
      speaker_id: participants[index % Math.max(participants.length, 1)]?.id || null,
      start: null,
      end: null,
      text: line,
    };
  });
  return { text: cleaned, utterances, language: null, duration: null };
}

module.exports = { parseSttResponse, utterancesFromPlainTranscript };
