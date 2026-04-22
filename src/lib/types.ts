// Core types shared by client and server.

export type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export interface Suggestion {
  type: SuggestionType;
  title: string;       // 3-6 word headline shown on card
  preview: string;     // 1-2 sentence concrete value — must be useful standalone
  // sourceHint: string;   // why this was surfaced now (internal/debug; hover tooltip)
  confidence: "high" | "medium" | "low";
}

export interface SuggestionBatch {
  id: string;
  createdAt: number;             // epoch ms
  suggestions: Suggestion[];
  generationMs?: number;         // wall-clock time it took to generate
  transcriptTokensUsed?: number; // approximate
}

export interface TranscriptChunk {
  id: string;
  createdAt: number;
  text: string;
}

export interface ChatMessage {
  id: string;
  createdAt: number;
  role: "user" | "assistant";
  content: string;
  // When a chat message was seeded by clicking a suggestion, we keep a reference
  // so the export can reconstruct the causal chain.
  sourceSuggestionId?: string;
}

export interface SessionExport {
  sessionStart: number;
  sessionEnd: number;
  transcript: Array<{ t: string; text: string }>;
  suggestionBatches: Array<{
    t: string;
    generationMs?: number;
    suggestions: Suggestion[];
  }>;
  chat: Array<{ t: string; role: string; content: string }>;
}
