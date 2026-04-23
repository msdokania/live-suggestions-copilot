import type {
  ChatMessage,
  SessionExport,
  SuggestionBatch,
  TranscriptChunk,
} from "./types";

function isoLocal(ts: number): string {
  return new Date(ts).toISOString();
}

export function buildSessionExport(input: {
  sessionStart: number;
  transcript: TranscriptChunk[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];
}): SessionExport {
  return {
    sessionStart: input.sessionStart,
    sessionEnd: Date.now(),
    transcript: input.transcript.map((c) => ({
      t: isoLocal(c.createdAt),
      text: c.text,
    })),

    suggestionBatches: [...input.batches]
      .slice()
      .reverse()
      .map((b) => ({
        t: isoLocal(b.createdAt),
        generationMs: b.generationMs,
        suggestions: b.suggestions,
      })),
    chat: input.chat.map((m) => ({
      t: isoLocal(m.createdAt),
      role: m.role,
      content: m.content,
    })),
  };
}

export function downloadSessionJson(data: SessionExport) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date(data.sessionStart)
    .toISOString()
    .replace(/[:.]/g, "-");
  a.href = url;
  a.download = `twinmind-session-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
