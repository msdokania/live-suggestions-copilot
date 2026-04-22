import { NextRequest } from "next/server";
import { groqChatCompletionStream } from "@/lib/groq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  systemPrompt: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  temperature: number;
  transcript: string;                // full / windowed transcript
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-groq-key");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing Groq API key." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  // Build a clean system + context user-prefix, then replay chat history,
  // then the new user message. This keeps the system prompt byte-identical
  // across calls for prompt-cache hits.
  const contextMessage = {
    role: "user" as const,
    content: `## MEETING TRANSCRIPT (context)\n${body.transcript || "(empty)"}\n\nUse this transcript to ground your answers. Do not restate it unless asked.`,
  };
  const contextAck = {
    role: "assistant" as const,
    content: "Got it. I'll use the transcript as context.",
  };

  const messages = [
    { role: "system" as const, content: body.systemPrompt },
    contextMessage,
    contextAck,
    ...body.history,
    { role: "user" as const, content: body.userMessage },
  ];

  try {
    const upstream = await groqChatCompletionStream(apiKey, {
      model: body.model,
      messages,
      temperature: body.temperature,
      reasoning_effort: body.reasoningEffort,
      max_tokens: 1500,
    });

    // Transform Groq's OpenAI-format SSE into a clean token stream for the
    // client. Each event yields one text delta. End of stream = "[DONE]".
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(payload);
                const delta: string =
                  json?.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  controller.enqueue(new TextEncoder().encode(delta));
                }
              } catch {
                // Ignore malformed chunks; Groq sometimes sends keep-alives.
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
