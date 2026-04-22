"use client";

import { useCallback, useRef } from "react";
import { useSession, useSettings } from "./store";
import type { ChatMessage, Suggestion } from "./types";

/**
 * Sends a user message (either free-typed or seeded from a clicked suggestion)
 * and streams the assistant's response into the chat.
 *
 * The "detailed answer" prompt and the "chat" prompt are different by design —
 * suggestion-click answers are longer, more report-like; free chat is more
 * conversational. We pick based on whether `sourceSuggestion` is provided.
 */
export function useChatStream() {
  const { transcript, chat, addChatMessage, updateLastAssistantMessage } =
    useSession();
  const { settings } = useSettings();

  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (userText: string, sourceSuggestion?: Suggestion) => {
      if (!settings.groqApiKey) {
        addChatMessage({
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          role: "assistant",
          content:
            "Missing Groq API key. Open Settings (gear icon) and paste one.",
        });
        return;
      }

      // 1. Push the user turn immediately so the UI feels responsive.
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: "user",
        content: userText,
      };
      addChatMessage(userMsg);

      // 2. Push an empty assistant placeholder that we'll stream into.
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: "assistant",
        content: "",
      };
      addChatMessage(assistantMsg);

      // 3. Prepare context.
      const systemPrompt = sourceSuggestion
        ? settings.detailedAnswerSystemPrompt
        : settings.chatSystemPrompt;

      const maxChars = sourceSuggestion
        ? settings.detailedAnswerContextChars
        : settings.chatContextChars;

      const fullTranscript = transcript.map((c) => c.text).join("\n");
      const windowedTranscript =
        fullTranscript.length > maxChars
          ? "…" + fullTranscript.slice(-maxChars)
          : fullTranscript;

      // Only pass prior exchanges (before this turn) into history.
      const history = chat
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      // 4. Stream.
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-groq-key": settings.groqApiKey,
          },
          body: JSON.stringify({
            systemPrompt,
            model: settings.chatModel,
            reasoningEffort: settings.chatReasoningEffort,
            temperature: settings.chatTemperature,
            transcript: windowedTranscript,
            history,
            userMessage: userText,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          const text = await resp.text();
          updateLastAssistantMessage(`⚠️ ${text || `HTTP ${resp.status}`}`);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let accum = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accum += decoder.decode(value, { stream: true });
          updateLastAssistantMessage(accum);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        updateLastAssistantMessage(`⚠️ ${err?.message ?? "Request failed"}`);
      }
    },
    [
      addChatMessage,
      chat,
      settings,
      transcript,
      updateLastAssistantMessage,
    ],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { send, abort };
}
