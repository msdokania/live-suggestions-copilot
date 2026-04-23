import { NextRequest } from "next/server";
import { groqChatCompletionStream } from "@/lib/groq";
import { parseRetrySeconds } from "../suggest/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  systemPrompt: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  temperature: number;
  transcript: string;
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

    // Groq's OpenAI-format SSE into a clean token stream
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
                // Ignore malformed chunks
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
    const msg = String(err?.message ?? "");
    const is429 = msg.includes("429") || /rate.?limit/i.test(msg);

    if (is429) {
      const isDaily = /per day|TPD/i.test(msg);
      const retrySec = parseRetrySeconds(msg);

      return new Response(
        JSON.stringify({
          error: isDaily ? "daily_limit" : "minute_limit",
          retryAfterMs: (retrySec ?? (isDaily ? 3600 : 15)) * 1000,
          rateLimit: true,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
