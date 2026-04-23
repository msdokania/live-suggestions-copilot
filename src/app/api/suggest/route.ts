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
  transcriptWindow: string;   // older context
  mostRecent: string;
  recentBatchTitles: string[];
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
      max_tokens: 1500,
    });

    const raw = completion?.choices?.[0]?.message?.content ?? "";
    const suggestions = parseSuggestions(raw);

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json(
        { error: "Model returned no valid suggestions", raw },
        { status: 502 },
      );
    }
    return NextResponse.json({
      suggestions: suggestions,
      generationMs: Date.now() - started,
    });
  } catch (err: any) {
    const raw = err?.response?.data ?? err;
    const code = raw?.error?.code || raw?.code || "";
    const message = raw?.error?.message || err?.message || "";

    if (code === "rate_limit_exceeded" || /429|rate.?limit/i.test(message)) {
      const isDaily = /per day|TPD/i.test(message);
      const retrySec = parseRetrySeconds(message);
      return NextResponse.json(
        {
          error: isDaily ? "daily_limit" : "minute_limit",
          rateLimit: true,
          retryAfterMs: (retrySec ?? (isDaily ? 3600 : 15)) * 1000,
        },
        { status: 429 },
      );
    }
    if (code === "json_validate_failed") {
      return NextResponse.json(
        { error: "invalid_json" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "generation_failed", },
      { status: 500 },
    );
  }
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

export function parseRetrySeconds(msg: string): number | null {
  const m = msg.match(/try again in (\d+)m([\d.]+)s/i) || msg.match(/try again in ([\d.]+)\s*s/i);
  if (!m) return null;
  if (m.length === 3) return Math.ceil(parseInt(m[1]) * 60 + parseFloat(m[2]));
  return Math.ceil(parseFloat(m[1]));
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
    typeof s.preview === "string" &&
    s.preview.length > 0
  );
}
