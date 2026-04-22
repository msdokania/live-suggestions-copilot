import { NextRequest, NextResponse } from "next/server";
import { groqChatCompletion } from "@/lib/groq";
import type { Suggestion } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  systemPrompt: string;
  model: string;
  meetingContext: string;
  reasoningEffort: "low" | "medium" | "high";
  temperature: number;
  transcriptWindow: string;   // older context, may be empty
  mostRecent: string;         // last ~30s, highest priority
  recentBatchTitles: string[]; // anti-repetition
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-groq-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing Groq API key. Paste your key in Settings." },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userContent = buildUserMessage(body);

  const started = Date.now();

  try {
    const completion = await groqChatCompletion(apiKey, {
      model: body.model,
      messages: [
        { role: "system", content: body.systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: body.temperature,
      reasoning_effort: body.reasoningEffort,
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });

    const raw = completion?.choices?.[0]?.message?.content ?? "";
    const suggestions = parseSuggestions(raw);
    console.log(`Suggestions: ${JSON.stringify(suggestions, null, 2)}`);

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json(
        { error: "Model returned no valid suggestions", raw },
        { status: 502 },
      );
    }

    // const filtered = (() => {
    //   if (suggestions.length <= 3) return suggestions;
    //   const high = suggestions.filter(s => s.confidence === "high");
    //   const medium = suggestions.filter(s => s.confidence === "medium");
    //   const combined = [...high, ...medium];
    //   if (combined.length >= 2) return combined.slice(0, 3);
    //   return suggestions;
    // })();
    return NextResponse.json({
      suggestions: suggestions,
      generationMs: Date.now() - started,
    });
  } catch (err: any) {
    const raw = err?.response?.data ?? err;
    console.dir(err, { depth: null });
    const code = raw?.error?.code || raw?.code || "";
    const message = raw?.error?.message || err?.message || "Suggestion generation failed";

    if (code === "rate_limit_exceeded" || /429|rate.?limit/i.test(message)) {
      const retrySec = parseRetrySeconds(message);
      return NextResponse.json(
        {
          error: "Rate limit reached",
          rateLimit: true,
          retryAfterMs: (retrySec ?? 15) * 1000,
        },
        { status: 429 },
      );
    }
    if (code === "json_validate_failed") {
      return NextResponse.json(
        {error: "Model returned invalid JSON. Try simplifying prompt.",},
        { status: 400 },
      );
    }
    return NextResponse.json(
      {error: message,},
      { status: 500 },
    );
    // const msg = String(err?.message ?? "");
    // const is429 = msg.includes("429") || /rate.?limit/i.test(msg);
    // if (is429) {
    //   const retrySec = parseRetrySeconds(msg);
    //   return NextResponse.json(
    //     {
    //       error: "Rate limit reached",
    //       rateLimit: true,
    //       retryAfterMs: (retrySec ?? 15) * 1000,
    //       retryAfterSec: retrySec ?? 15,
    //     },
    //     { status: 429 },
    //   );
    // }
    // return NextResponse.json(
    //   { error: err?.message ?? "Suggestion generation failed" },
    //   { status: 500 },
    // );
  }
}

function parseRetrySeconds(msg: string): number | null {
  const m = msg.match(/try again in ([\d.]+)\s*s/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.ceil(n) : null;
}

function buildUserMessage(body: Body): string {
  const parts: string[] = [];

  if (body.recentBatchTitles.length > 0) {
    parts.push(
      `RECENT_BATCH_TITLES (do NOT repeat these ideas):\n- ${body.recentBatchTitles.join("\n- ")}`,
    );
  } else {
    parts.push("RECENT_BATCH_TITLES: (none — this is the first batch)");
  }

  if (body.transcriptWindow.trim().length > 0) {
    parts.push(`## EARLIER CONTEXT (background only, lower priority)\n${body.transcriptWindow}`);
  }

  if (body.meetingContext && body.meetingContext.trim().length > 1) {
    parts.push(
      `## MEETING CONTEXT (high priority)\nThe user has described this conversation as: ${body.meetingContext}`
    );
  }
  parts.push(
    `## MOST RECENT (highest priority — anchor every suggestion here)\n${body.mostRecent || "(no speech yet)"}`,
  );

  parts.push(
    "Now produce exactly 3 suggestions as JSON, following every rule in the system prompt.",
  );

  return parts.join("\n\n");
}

function parseSuggestions(raw: string): Suggestion[] | null {
  // Strip accidental ```json fences even though JSON mode should prevent them.
  const cleaned = raw.replace(/^```json\s*|```\s*$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const list = Array.isArray(parsed) ? parsed : parsed.suggestions;
    if (!Array.isArray(list)) return null;
    return list.filter(isValidSuggestion);
  } catch {
    return null;
  }
}

const VALID_TYPES = new Set([
  "question_to_ask",
  "talking_point",
  "answer",
  "fact_check",
  "clarification",
]);

function isValidSuggestion(s: any): s is Suggestion {
  return (
    s &&
    typeof s.type === "string" &&
    VALID_TYPES.has(s.type) &&
    // typeof s.title === "string" &&
    // s.title.length > 0 &&
    typeof s.preview === "string" &&
    s.preview.length > 0
  );
}
