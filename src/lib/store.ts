"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "./types";
import { DEFAULT_SETTINGS, type Settings } from "./prompts";

interface SessionState {
  sessionStart: number;
  isRecording: boolean;

  // Data
  transcript: TranscriptChunk[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];

  // UI
  isGeneratingSuggestions: boolean;
  lastSuggestionError: string | null;
  autoRefreshCountdownMs: number;

  // Actions
  startSession: () => void;
  stopRecording: () => void;
  setRecording: (b: boolean) => void;
  appendTranscript: (text: string) => void;
  addBatch: (batch: SuggestionBatch) => void;
  setGeneratingSuggestions: (b: boolean) => void;
  setLastSuggestionError: (e: string | null) => void;
  setAutoRefreshCountdownMs: (ms: number) => void;
  addChatMessage: (m: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  resetSession: () => void;
}

export const useSession = create<SessionState>((set) => ({
  sessionStart: Date.now(),
  isRecording: false,
  transcript: [],
  batches: [],
  chat: [],
  isGeneratingSuggestions: false,
  lastSuggestionError: null,
  autoRefreshCountdownMs: 30_000,

  startSession: () =>
    set({
      sessionStart: Date.now(),
      isRecording: false,
      transcript: [],
      batches: [],
      chat: [],
      isGeneratingSuggestions: false,
      lastSuggestionError: null,
    }),
  stopRecording: () => set({ isRecording: false }),
  setRecording: (b) => set({ isRecording: b }),
  appendTranscript: (text) => {
    const t = text.trim();
    if (!t) return;
    set((s) => ({
      transcript: [
        ...s.transcript,
        { id: crypto.randomUUID(), createdAt: Date.now(), text: t },
      ],
    }));
  },
  addBatch: (batch) =>
    set((s) => ({ batches: [batch, ...s.batches] })),
  setGeneratingSuggestions: (b) => set({ isGeneratingSuggestions: b }),
  setLastSuggestionError: (e) => set({ lastSuggestionError: e }),
  setAutoRefreshCountdownMs: (ms) => set({ autoRefreshCountdownMs: ms }),
  addChatMessage: (m) => set((s) => ({ chat: [...s.chat, m] })),
  updateLastAssistantMessage: (content) =>
    set((s) => {
      if (s.chat.length === 0) return s;
      const last = s.chat[s.chat.length - 1];
      if (last.role !== "assistant") return s;
      return {
        chat: [
          ...s.chat.slice(0, -1),
          { ...last, content },
        ],
      };
    }),
  resetSession: () =>
    set({
      sessionStart: Date.now(),
      transcript: [],
      batches: [],
      chat: [],
      isRecording: false,
      lastSuggestionError: null,
    }),
}));

// -----------------------------------------------------------------------------
// Settings store — persisted to localStorage (except the meeting context)
// -----------------------------------------------------------------------------

interface SettingsState {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: "twinmind-settings-v1",
      onRehydrateStorage: () => (s) => {
        if (s) { s.settings.meetingContext = ""; }
      },
    },
  ),
);
