"use client";

import { useCallback, useRef } from "react";
import { useSession, useSettings } from "./store";
import type { ChatMessage, Suggestion } from "./types";

/**
 * Sends a user message (either free-typed or seeded from a clicked suggestion)
 * and streams the assistant's response into the chat.
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

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: "user",
        content: userText,
        sourceSuggestionId: sourceSuggestion ? "model" : "user",
      };
      addChatMessage(userMsg);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: "assistant",
        content: "",
      };
      addChatMessage(assistantMsg);

      // Context -
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

      // Pass prior exchanges (before this turn) into history.
      const history = chat
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      // Stream -
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

        if (!resp.ok) {
          let errMsg = "Something went wrong. Please try again.";
          try {
            const data = await resp.json();
            if (data.error === "daily_limit") {
              const mins = Math.ceil((data.retryAfterMs ?? 3600000) / 60000);
              errMsg = `**Daily rate limit reached.**\n\nYour Groq account has used its daily token allocation. Limit resets in ~${mins} minutes, or [upgrade to Groq Dev Tier](https://console.groq.com/settings/billing) for higher limits.`;
            } else if (data.error === "minute_limit") {
              const secs = Math.ceil((data.retryAfterMs ?? 15000) / 1000);
              errMsg = `**Rate limited.** Retry in ${secs}s…`;
            } else if (resp.status === 401) {
              errMsg = `**Missing API key.** Open Settings (gear icon) and paste your Groq API key.`;
            }
          } catch { }
          updateLastAssistantMessage(`⚠️ ${errMsg}`);
          return;
        }

        if (!resp.body) {
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
