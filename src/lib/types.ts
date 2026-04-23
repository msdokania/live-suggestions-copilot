// Core types shared by client and server.

export type SuggestionType =
  | "question_to_ask"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export interface Suggestion {
  type: SuggestionType;
  preview: string;
}

export interface SuggestionBatch {
  id: string;
  createdAt: number;             // epoch ms
  suggestions: Suggestion[];
  generationMs?: number;         // wall-clock time
  transcriptTokensUsed?: number;
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
