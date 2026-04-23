// Server-only helpers for calling Groq.
//
// We use Groq's OpenAI-compatible REST API directly (no SDK). Reasons:
//   - Zero runtime overhead, one fewer dep to explain in the README
//   - Streaming Server-Sent Events are trivial to proxy through Next.js
//   - We keep full control over headers (including `X-Api-Key` forwarding)

const GROQ_BASE = "https://api.groq.com/openai/v1";

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: "low" | "medium" | "high";
  response_format?: { type: "json_object" };
  stream?: boolean;
}

/**
 * Non-streaming chat completion. Returns the full response JSON.
 * Throws on non-2xx with a readable message.
 */
export async function groqChatCompletion(
  apiKey: string,
  body: ChatCompletionRequest,
): Promise<any> {
  const resp = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: false }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq ${resp.status}: ${text.slice(0, 500)}`);
  }
  return resp.json();
}

/**
 * Streaming chat completion. Returns the raw Response so the caller can
 * proxy the SSE body straight to the client.
 */
export async function groqChatCompletionStream(
  apiKey: string,
  body: ChatCompletionRequest,
): Promise<Response> {
  const resp = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq ${resp.status}: ${text.slice(0, 500)}`);
  }
  return resp;
}

/**
 * Whisper Large V3 transcription. Takes a File/Blob, returns plain text.
 */
export async function groqTranscribe(
  apiKey: string,
  audio: Blob,
  opts: { promptBias?: string; model?: string } = {},
): Promise<{ text: string }> {
  const form = new FormData();
  // The extension matters for Groq's auto-detection; .webm is what MediaRecorder produces.
  form.append("file", audio, "chunk.webm");
  form.append("model", opts.model ?? "whisper-large-v3");
  form.append("response_format", "json");
  form.append("language", "en");
  form.append("temperature", "0");
  if (opts.promptBias) {
    // Whisper's prompt field is capped at ~224 tokens
    form.append("prompt", opts.promptBias.slice(-800));
  }

  const resp = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq transcribe ${resp.status}: ${text.slice(0, 500)}`);
  }
  return resp.json();
}
